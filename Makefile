
clean:
	rm -f Makefile.config minimal.com minimal.lst stage12.inc stage3.com stage3.lst stage3.asc stage12.com

#
# Load the Makefile configuration if present
#
-include Makefile.config

# STEP 1:
#  Create an initial Makefile configuration if not present

Makefile.config :
	echo 'STAGE1BASE=0x0100' > Makefile.config
	echo 'STAGE3BASE=0x0130' >> Makefile.config
	echo 'INITSI=0x0100' >> Makefile.config
	echo 'INITHASH=0x20cd' >> Makefile.config
	echo 'SEEDTEXT=0x6e' >> Makefile.config		# User defined ascii-safe value that is even.

# STEP 2:
#  Create minimalistic stage1 (patcher) + stage2 (pre-loader) for analysis

minimal.com :  stage12.S smile.lds Makefile.config
	gcc -o minimal.o $< -c -m32 -fno-asynchronous-unwind-tables -march=i386 -mtune=i386 -g0 -DMINIMAL=1
	ld -o $@ minimal.o -T smile.lds -Ttext ${STAGE1BASE}
	objdump $@ -D -b binary -m i386 -M addr16,data16 --adjust-vma=${STAGE1BASE} >minimal.lst

# STEP 3:
#  Determine stage1 byte promotion, stage2 fixups, seeds and hashes.
#  Reading settings from `Makefile.config`

stage12.inc : genStage1.js minimal.com Makefile.config
	node genStage1.js $@ minimal.com --config=Makefile.config

# STEP 4:
#  Create stage3 (loader) image.

stage3.com : stage3.S smile.lds Makefile.config
	gcc -m32 -march=i386 -mtune=i386 -g0 -c -o stage3.o -Os -fno-zero-initialized-in-bss -fomit-frame-pointer -fno-asynchronous-unwind-tables $<
	ld -o $@ stage3.o -T smile.lds -Ttext ${STAGE3BASE}
	objdump -D $@ -b binary -m i386 -M addr16,data16 --adjust-vma=${STAGE3BASE} >stage3.lst

# STEP 5:
#  Create ascii-safe version of stage3 (loader) and update Makefile.config with the actual used value for SEED2
#  `Makefile.config` only updates when settings change. A changed setting will cause make to reload.
#  NOTE: also depends on `stage12.inc` which updates `HASHHEAD`

stage3.asc : genStage3.js stage3.com template.txt stage12.inc Makefile.config
	@echo "## This can take 10 minutes"
	node genStage3.js stage3.asc stage3.com template.txt --config=Makefile.config --first


# STEP 6:
#  Create actual stage1+2 (pre-loader), overwriting the default value for `SEEDHEAD`
#  NOTE: also depends on `stage3.asc` which updates `SEEDHEAD`

stage12.com : stage12.S stage12.inc smile.lds Makefile.config stage3.asc
	gcc -o stage12.o $< -c -m32 -fno-asynchronous-unwind-tables -march=i386 -mtune=i386 -g0 -DSEEDHEAD=${SEEDHEAD}
	ld -o $@ stage12.o -T smile.lds -Ttext ${STAGE1BASE}
	objdump $@ -D -b binary -m i386 -M addr16,data16 --adjust-vma=${STAGE1BASE} >stage12.lst

# STEP 7:
#  Compile stage4 (demo)

stage4.com : stage4.c smile.lds
	gcc -o stage4.o $< -m32 -march=i386 -mtune=i386 -g0 -c -Os -fno-zero-initialized-in-bss -fomit-frame-pointer -fno-asynchronous-unwind-tables
	ld -o stage3.com stage4.o -T smile.lds -Ttext ${STAGE3BASE}
	objdump -D stage4.com -b binary -m i386 -M addr16,data16 --adjust-vma=${STAGE3BASE} >stage4.lst

# STEP 8:
#  Encode stage4 (demo) as mixed radix10/radix13

stage4.asc : genStage4.js stage4.com template.txt
	node genStage4.js stage4.asc stage4.com template.txt --offset= --length=

# STEP 9
#  Glue parts together

smile.com : stage12.com stage3.asc stage4.asc
	cat stage12.com stage3.asc stage4.asc >smile.com
	chmod +x smile.com

# STEP 10
#  Inspect outcome, adapt `template.txt` is necessary and rerun if changed.

HASH = 0x6668

stage2Offset=0
stage2Length=217
stage3Offset=217 # stage2Length
stage3Length=311
payloadOffset=544 #528 # stage2Length+stage3Length NOTE: due to variable length encoding this needed manual tweaking to get aligned, notably payload.asc needs to start with 25 lowercase letters
payloadLength=672

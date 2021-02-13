##
## Below is regular Makefile. automake is only a wrapper which provides distribution benefits.
##

#
# Not so random macro definitions
#

ACLOCAL_AMFLAGS = -I m4
AUTOMAKE_OPTIONS = subdir-objects

EXTRA_DIST = LICENSE.txt CHANGELOG.md README.md LISTING.txt instructions.txt .gitignore autogen.sh package.json package-lock.json \
		template.txt smile.lds genStage1.js genStage2.js genStage3.js stage12.S stage3.S stage4.c Makefile.config

.PRECIOUS:   Makefile.config minimal.com minimal.lst stage1.inc stage12.com stage12.lst stage3.com stage3.lst stage3.asc stage4.com stage4.lst stage4.asc
CLEANFILES = Makefile.config minimal.com minimal.lst stage1.inc stage12.com stage12.lst stage3.com stage3.lst stage3.asc stage4.com stage4.lst stage4.asc smile.com

#
# Load the Makefile configuration, if present.
# Generators may change the contents to resolve forward references and trigger reloading of makefiles.
#
-include Makefile.config

#
# test for nodejs installed modules
#

node_modules/minimist/package.json :
	npm install

# STEP 1:
#  Create an initial Makefile configuration if not present

Makefile.config : node_modules/minimist/package.json
	@echo "#Step-1"
	echo 'STAGE1BASE=0x0100' > Makefile.config
	echo 'STAGE3BASE=0x0131' >> Makefile.config	# +1 because of extra instruction inlining a CRLF
	echo 'INITSI=0x0100' >> Makefile.config
	echo 'INITHASH=0x20cd' >> Makefile.config
	echo 'SEEDTEXT=0x6e' >> Makefile.config		# User defined ascii-safe value that is even
	echo 'SEEDHEAD=0x3030' >> Makefile.config	# placeholder
	echo 'STAGE4BASE=0x0000' >> Makefile.config	# placeholder


# STEP 2:
#  Create minimalistic stage1 (patcher) + stage2 (pre-loader) for analysis

minimal.com :  stage12.S smile.lds Makefile.config
	@echo "#Step-2"
	gcc -o minimal.o $< -c -m32 -fno-asynchronous-unwind-tables -march=i386 -mtune=i386 -g0 -DMINIMAL=1
	ld -o $@ minimal.o -T smile.lds -Ttext ${STAGE1BASE}
	objdump $@ -D -b binary -m i386 -M addr16,data16 --adjust-vma=${STAGE1BASE} >minimal.lst

# STEP 3:
#  Determine stage1 byte promotion, stage2 fixups, seeds and hashes.
#  Requires: STAGE1BASE, STAGE3BASE, INITSI, INITHASH
#  Provides: OFSHASH, OFSHEAD, OFSTEXT, HASHHEAD

stage1.inc : genStage1.js minimal.com Makefile.config
	@echo "#Step-3"
	node genStage1.js $@ minimal.com --config=Makefile.config

# STEP 4:
#  Create stage3 (loader) image.
#  Requires: STAGE3EOS

stage3.com : stage3.S smile.lds stage1.inc
	@echo "#Step-4"
	gcc -o stage3.o $< -m32 -march=i386 -mtune=i386 -g0 -c  -Os -fno-zero-initialized-in-bss -fomit-frame-pointer -fno-asynchronous-unwind-tables
	ld -o $@ stage3.o -T smile.lds -Ttext ${STAGE3BASE}
	objdump -D $@ -b binary -m i386 -M addr16,data16 --adjust-vma=${STAGE3BASE} >stage3.lst

# STEP 5:
#  Create ascii-safe version of stage3 (loader)
#  Requires: STAGE3BASE, HASHHEAD, SEEDTEXT, STAGE3OFFSET
#  Provides: SEEDHEAD, STAGE4BASE, STAGE4OFFSET

stage3.asc : stage3.com template.txt genStage2.js Makefile.config
	@echo "#Step-5"
	node genStage2.js $@ stage3.com template.txt --config=Makefile.config


# STEP 6:
#  Create actual stage1+2 (pre-loader)
#  Requires: SEEDHEAD

stage12.com : stage12.S stage1.inc smile.lds stage1.inc
	@echo "#Step-6"
	gcc -o stage12.o $< -c -m32 -fno-asynchronous-unwind-tables -march=i386 -mtune=i386 -g0
	ld -o $@ stage12.o -T smile.lds -Ttext ${STAGE1BASE}
	objdump $@ -D -b binary -m i386 -M addr16,data16 --adjust-vma=${STAGE1BASE} >stage12.lst

# STEP 7:
#  Compile stage4 (demo)

stage4.com : stage4.c smile.lds Makefile.config
	@echo "#Step-7"
	gcc -o stage4.o $< -m32 -march=i386 -mtune=i386 -g0 -c -Os -fno-zero-initialized-in-bss -fomit-frame-pointer -fno-asynchronous-unwind-tables -fno-PIC
	ld -o stage4.com stage4.o -T smile.lds -Ttext ${STAGE4BASE}
	objdump -D stage4.com -b binary -m i386 -M addr16,data16 --adjust-vma=${STAGE4BASE} >stage4.lst

# STEP 8:
#  Encode stage4 (demo) as mixed radix10/radix13
#  Requires: STAGE4BASE, STAGE4OFFSET
#  Provides: STAGE3EOS

stage4.asc : stage4.com template.txt genStage3.js Makefile.config
	@echo "#Step-8"
	node genStage3.js $@ $< template.txt --config=Makefile.config

# STEP 9
#  Glue parts together

smile.com : stage12.com stage3.asc stage4.asc
	@echo "#Step-9"
	cat stage12.com stage3.asc stage4.asc >smile.com
	chmod +x smile.com
	@echo "#"
	@echo "# re-run until nothing changes"
	@echo "#"

# STEP 10
#  Inspect outcome, adapt `template.txt` if necessary and rerun when something changed.

# [some non-automatable human creativity, flexibility and out-of-the-box thoughts, and actions]

##
## Give hints when automake invoked with no target.
##

all-local:
	@echo 
	@echo "Type: make smile.com"
	@echo
	@echo !! Re-run the above until nothing changes.
	@echo

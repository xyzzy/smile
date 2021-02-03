stage1Base=0x0100
stage2Base=0x0139 # 0x014c
stage3Base=0xAAAA # 0x0156 # 0x0184

stage2Offset=0
stage2Length=217
stage3Offset=217 # stage2Length
stage3Length=311
payloadOffset=544 #528 # stage2Length+stage3Length NOTE: due to variable length encoding this needed manual tweaking to get aligned, notably payload.asc needs to start with 25 lowercase letters
payloadLength=672

all : smile.com
	cat stage1.com stage2.asc stage3.asc >smile.com
	chmod +x smile.com

smile.com : stage1.com stage2.asc stage3.asc
	cat stage1.com stage2.asc stage3.asc >smile.com
	chmod +x smile.com

unpatched.com : stage12.S smile.lds
	gcc -o unpatched.o -m32 -fno-asynchronous-unwind-tables -march=i386 -mtune=i386 -g0 -c -DUNPATCHED $<
	ld -o $@ unpatched.o -T smile.lds -Ttext ${stage1Base}
	objdump -D $@ -b binary -m i386 -M addr16,data16 --adjust-vma=${stage1Base} >unpatched.lst

stage12.com : stage12.S smile.lds stage12.inc
	gcc -m32 -fno-asynchronous-unwind-tables -march=i386 -mtune=i386 -g0 -c $<
	ld -o $@ stage12.o -T smile.lds -Ttext ${stage1Base}
	objdump -D $@ -b binary -m i386 -M addr16,data16 --adjust-vma=${stage1Base} >stage12.lst

stage2.com : stage2.S smile.lds
	gcc -m32 -fno-asynchronous-unwind-tables -march=i386 -mtune=i386 -g0 -c $<
	ld -o $@ stage2.o -T smile.lds -Ttext ${stage2Base}
	objdump -D $@ -b binary -m i386 -M addr16,data16 --adjust-vma=${stage2Base} >stage2.lst

stage3.com : stage3.c smile.lds
	gcc -m32 -march=i386 -mtune=i386 -g0 -c -o stage3.o -Os -fno-zero-initialized-in-bss -fomit-frame-pointer -fno-asynchronous-unwind-tables $<
	ld -o $@ stage3.o -T smile.lds -Ttext ${stage3Base}
	objdump -D $@ -b binary -m i386 -M addr16,data16 --adjust-vma=${stage3Base} >stage3.lst

#######

stage2.asc : genStage2.php stage2.com template.txt
	php genStage2.php stage2.asc stage2.com template.txt

stage3.asc : genStage3.php stage3.com template.txt
	php genStage3.php stage3.asc stage3.com template.txt ${stage3Offset} ${stage3Length}

payload.asc : genPayload.php payload.com template.txt
	php genPayload.php payload.asc payload.com template.txt ${payloadOffset} ${payloadLength}

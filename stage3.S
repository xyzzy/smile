	.code16

	//!!! %bx=01a0(or something), %bp=0x00a2, %si=0xc131, (%di)=0xf817

	////////////////////////////////////////////
	// stage3
	////////////////////////////////////////////
	//
	// Stage1 jumps to Stage2Start
	// This stage is basic code string enumerator. It also maintains the pool (%dx)
	// used in for the radix conversion. This stage is split into 2 halves. The
	// first is as compact as possible because it loaded by stage1 which uses a 	
	// very expensive compression scheme. However, there is no end-of-stream marker
	// so the loops can only exit by instruction modification. This is done by loading the
	// second part pre-increment, so it will overwrite the last jump, making it
	// falthrough into the main stage2 code. The main code decodes stage3 and places it
	// on the stack. This is required because stage3 will unpack the payload into this 
	// location.
	//
	////////////////////////////////////////////

Stage3Start:

// inherit %bp and %di from stage2.
// use %dx as pool, %ax as enum

	clr	%dx			// clear pool
	mov	Stage4Start,%di		// start of stage4

GetEnum:
	inc	%bp			// pre-increment
	movzx	'z'(%bp),%ax		// load next character from code string

	subb	$'a'-2,%al		// test for alpha. Need the extra 2 for the charset decoding
	jae	GotAlpha		// yes, jump higher or same
	subb	$'0'-'a'+2,%al		// test for numeric (and compensate for the previous -2)
	jb	GetEnum			// no, next char

GotNumeric:
	imul    $10,%dx,%dx		// grow pool for radix10
	jmp	GotEnum

GotAlpha:
	imul	$13,%dx,%dx		// grow pool for radix13

	shr	%al			// convert charset encoding
	jnc	GotEnum			// jump if even
	cmp	$9,%al			// if "vxz" shift to fill gap for values "456"
	je	GotEnum
	sub	$7,%al

GotEnum:
	addw	%ax,%dx			// inject

	orb	%dh,%dh			// test if byte present
	je	GetEnum			// no, keep lurking
	cmp	$0x999,%dx		// test for terminator
	je	Stage4Start		// jump if found

	movb	%dl,(%di)		// save byte
	inc	%di			// post-increment

	shrw	$8,%dx			// reduce pool
	jmp	GetEnum			// loop

Stage4Start:

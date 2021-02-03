	.code16

// SEED/multiplier for stage3
SEEDH='a'
SEEDL='a'

#if defined(UNPATCHED) && UNPATCHED

// STAGE-1 config
IMM1='a'	// multiplier for step-1
IMM2='a'	// multiplier for step-2
OFSDI='a'	// extra offset for initial %di
IMM3='a'	// multiplier for step-3
IMM4='a'	// multiplier for step-4
IMM5='a'	// multiplier for step-5

// Patch config
OFSMEM1='a'	// patch offset for step-4
FIX1H=0		// patch for HI-byte
FIX1L=0		// patch for LO-byte
OFSMEM2='a'	// patch offset for step-4
FIX2H=0		// patch for HI-byte
FIX2L=0		// patch for LO-byte
OFSMEM3='a'	// patch offset for step-5
FIX3H=0		// patch for HI-byte
FIX3L=0		// patch for LO-byte

// STAGE-2 config
SEEDH='a'	// multiplier hiByte for stage2
SEEDL='a'	// multiplier loByte for stage2
HEAD='a'	// %di offset to encoded stage3 DATA

#else

#include "stage12.inc"

#endif

	/**
	 * STAGE-1
	 *
	 * Patches missing instructions into stage 2
	 */
stage1Start:

	/*
	 * step-1: Step-2 does not generate enough diversity for %di, generate an additional number
	 */

	imul	$IMM1,(%bx),%si		// next number
	xor	%si,(%bx)		// update hash

	/*
	 * step-2: Generate number and initialize %di so that it points to the anchor
	 *	   Use initial value of %di (=0xxfffe), does not work when run from debug.exe
	 */

	imul	$IMM2,(%bx),%si		// next number
	xor	OFSDI(%bx,%si),%di	// load %di

	/*
	 * step-3: Step-4 does not generate enough diversity for patches, generate an additional number
	 */

	imul	$IMM3,(%bx),%si		// next number
	xor	%si,(%bx)		// update hash

	/*
	 * step-4: Generate number and patch stage2
	 */

	imul	$IMM4,(%bx),%si		// next number
 	xor	%si,OFSMEM1(%di)	// patch word
 	xor	%si,OFSMEM2(%di)	// patch word

	/*
	 * step-5: Generate number and patch stage2
	 */

	imul	$IMM5,(%bx),%si		// next number
 	xor	%si,OFSMEM3(%di)	// patch word

	/**
	 * STAGE-2
	 *
	 * Unpack stage-3
	 *
	 * Use register %di for bor both input and output data
	 * Use %bx (initial value 0x0000) to indicate the difference in dytancd between input/output
	 */
stage2Start:

	//      v---- patched code               v-- unpatched code     v-- instruction                         v-- comment

	/*
	 * step-1: generate number
	 *
	 * Update hash at head of extracted data
	 */

	.byte	0x69,0x75,0x79,SEEDL,SEEDH	// 69 75 X X X		imul	$SEED,HEAD(%bx,%di),%si		//* update hash
   	.byte	0x31,0x75,HEAD			// 31 75 X		xorw	%si,HEAD(%bx,%di)		//* number generator

	/*
	 * step-2: output byte
	 *
	 * If high bit of hash is set then low byte contains next byte.
	 * Increment %bx to shift hash one byte leaving the desired output byte behind
	 */

	.byte	0x79,0x04^FIX1L			// 79 04		jns	L2				//* jump is sign bit clear
	.byte	0x43^FIX1H			// 43			inc	%bx				//* shift output position

	/*
	 * step-3: load next input byte
	 *
	 * Load next byte from input by incrementing %di, decrement %di to keep the output position
	 * Inject the loaded byte into the low-byte of the hash for maximum effect.
	 * Injecting into the low-byte has an undesired side-effect for step-4, so inject into the high-byte.
	 * Injection is a memory-memory operation, use %ah as intermediate byte. %ax is initially 0x0000.
	 */
L2:
	.byte	0x32,0x66,HEAD			// 32 65 X		xorb	HEAD(%di),%ah			//* load next input byte
	.byte	0x47^FIX2L			// 47			inc	%di				//* shift input position
	.byte	0x4b^FIX2H			// 4b			dec	%bx				//* increment distance input/output, decrement because %bx is used negatively
	.byte	0x30,0x61,HEAD+1		// 30 61 X		xorb	%ah,HEAD+1(%bx,%di)		//* inject into HEAD high-byte

	/*
	 * step-4: loop until finished
	 *
	 * Injecting where the result is zero can be used as trigger to indicate end-of-sequence.
	 * This however should not happen for the low-byte because emitting a zero is a valid situation.
	 */
	.byte	0x75^FIX3L,0xe5^FIX3H		// 75 e5		jne	stage2Start			//* repeat until end-of-sequence
stage2End:

/*
 *  This file is part of smile: ASCII safe binaries
 *  Copyright (C) 2011, 2021, xyzzy@rockingship.org
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Changelog:
 *
 * @date 2021-02-08 22:52:07
 *
 * The end-of-sequence marker was to generic causing many encoding rejections.
 * End-of-sequence is now flagged by the head hash becoming zero.
 * Downside is that the input needs to be loaded as a word.
 * Improvement reduces encoded stage3 with ~20 bytes.
 * The original encoding was 216 characters, now it is 146.
 */

	.code16

// load configuration
#include "stage12.inc"

	/**
	 * STAGE-1
	 *
	 * Patches missing instructions into stage 2
	 */
stage1Start:

	/*
	 * step-1: Create %di from hash located at end of stage-2
	 *	   NOTE: the initial hash must be even
	 */

	// when calling from DEBUG.EXE, don't forget to set %si=0x0100
	imul	$IMM1,OFSHASH(%bp,%si),%di	// load %di

	/*
	 * step-2: Add entropy to the number generator
	 */

	imul	$IMM2,(%bx),%si		// next number
	xor	%si,(%bx)		// update hash

	/*
	 * step-3: Generate number and patch stage2
	 */

	imul	$IMM3,(%bx),%si		// next number
 	xor	%si,OFSMEM1(%di)	// patch word
 	xor	%si,OFSMEM2(%di)	// patch word

	/*
	 * step-4: Generate number and patch stage2
	 */

	imul	$IMM4,(%bx),%si		// next number
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

	.byte	0x69,0x75,OFSHEAD,SEEDL,SEEDH	// 011b: 69 75 X X X	imul	$SEED,OFSHEAD(%bx,%di),%si	//* update hash
   	.byte	0x31,0x75,OFSHEAD		// 0120: 31 75 X	xorw	%si,OFSHEAD(%bx,%di)		//* number generator

	/*
	 * step-2: output byte
	 *
	 * If high bit of hash is set then low byte contains next byte.
	 * Increment %bx to shift hash one byte leaving the desired output byte behind
	 */

	.byte	0x79,0x04^FIX1L			// 0123: 79 04		jns	L2				//* jump is sign bit clear
	.byte	0x43^FIX1H			// 0125: 43		inc	%bx				//* shift output position

	/*
	 * step-3: load next input byte
	 *
	 * Load next byte from input by incrementing %di, decrement %di to keep the output position
	 * Inject the loaded byte into the low-byte of the hash for maximum effect.
	 * Injecting into the low-byte has an undesired side-effect for step-4, so inject into the high-byte.
	 * Injection is a memory-memory operation, use %ah as intermediate byte. %ax is initially 0x0000.
	 */
L2:
	.byte	0x6b,0x6d,OFSTEXT-1,0x6e	// 0125: 6b 6d X 6e	imul	$'n',OFSTEXT-1(%di),%bp		//* use input text as word to generate next number
	.byte	0x47^FIX2L			// 0129: 47		inc	%di				//* shift input position
	.byte	0x4b^FIX2H			// 012a: 4b		dec	%bx				//* increment distance input/output, decrement because %bx is used negatively
	.byte	0x31,0x69,OFSHEAD		// 012b: 31 69 78	xorw	%bp,OFSHEAD(%bx,%di)		//* Inject entropy into HEAD

	/*
	 * step-4: loop until finished
	 *
	 * Injecting where the result is zero can be used as trigger to indicate end-of-sequence.
	 * This however should not happen for the low-byte because emitting a zero is a valid situation.
	 */
	.byte	0x75^FIX3L,0xe5^FIX3H		// 012e: 75 e5		jne	stage2Start			//* repeat until end-of-sequence
stage2End:

	.byte	HASHL, HASHH			// Initial hash

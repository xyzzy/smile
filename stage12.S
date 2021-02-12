/*
 *  This file is part of smile: ASCII-safe binaries
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

#if defined(MINIMAL) && MINIMAL

// STAGE-1
OFSHASH='n' 	// %si offset containing number generator hash, hash=0x6668
HASH1=0x20cd	// number generator to patch stage2 code
SEEDDI=0x6e	// multiplier for step-1A.
SEEDSI=0x6e 	// multiplier for step-1B.
SEEDFIX12=0x6e 	// multiplier for step-1C.
SEEDFIX3=0x6e 	// multiplier for step-1D.
OFSFIX1='n' 	// patch offset for step-2B
FIX1H=0x00	// patch for HI-byte
FIX1L=0x00 	// patch for LO-byte
OFSFIX2='n' 	// patch offset for step-2C
FIX2H=0x00 	// patch for HI-byte
FIX2L=0x00 	// patch for LO-byte
OFSFIX3='n' 	// patch offset for step-2D
FIX3H=0x00 	// patch for HI-byte
FIX3L=0x00 	// patch for LO-byte

// STAGE-2A
OFSHEAD='n' 	// %di offset to output HEAD containing number generator hash
HASHHEAD=0x6e6e	// number generator hash to create unpack values
HASHHEADH='n' 	// decoder hash HI-byte
HASHHEADL='n' 	// decoder hash LO-byte
SEEDHEAD=0x6e6e

// STAGE-2B
OFSTEXT='n' 	// %di offset to input TEXT containing the next character
SEEDTEXT=0x6e	// number generator to seed HASHHEAD

#else
// load configuration
#include "stage1.inc"
#endif

// split seed into hi-lo byte
SEEDHEADL=(SEEDHEAD & 0xff)
SEEDHEADH=(SEEDHEAD >> 8)

	/**
	 * STAGE-1
	 *
	 * Patches missing instructions into stage 2
	 */
stage1Start:

	/*
	 * step-1A: Create %di from hash located at end of stage-2
	 *	   NOTE: the initial hash must be even
	 */

	// when calling from DEBUG.EXE, don't forget to set %si=0x0100
	imul	$SEEDDI,OFSHASH(%bx,%si),%di	// load %di

	/*
	 * step-1B: Add entropy to the number generator
	 */

	imul	$SEEDSI,(%bx),%si	// next number
	xor	%si,(%bx)		// update hash

	/*
	 * step-1C: Generate number and patch stage2
	 */

	imul	$SEEDFIX12,(%bx),%si	// next number
 	xor	%si,OFSFIX1(%di)	// patch word
 	xor	%si,OFSFIX2(%di)	// patch word

	/*
	 * step-1D: Generate number and patch stage2
	 */

	imul	$SEEDFIX3,(%bx),%si	// next number
 	xor	%si,OFSFIX3(%di)	// patch word

	/**
	 * STAGE-2
	 *
	 * Unpack stage-3
	 *
	 * Use register %di for bor both input and output data
	 * Use %bx (initial value 0x0000) to indicate the difference in distance between input/output
	 *
	 * NOTE: Instruction changes also need to be applied to `genStage1.js`.
	 */
stage2Start:

	//      v---- patched code               v-- unpatched code     v-- instruction                         v-- comment

	/*
	 * step-2A: generate number
	 *
	 * Update hash at head of extracted data
	 */

	.byte	0x69,0x71,OFSHEAD,SEEDHEADL,SEEDHEADH	// 011a: 69 71 X X X	imul	$SEED,OFSHEAD(%bx,%di),%si	//* update hash
   	.byte	0x31,0x71,OFSHEAD		// 011f: 31 71 X	xorw	%si,OFSHEAD(%bx,%di)		//* number generator

	/*
	 * step-2B: output byte
	 *
	 * If high bit of hash is set then low byte contains next byte.
	 * Increment %bx to shift hash one byte leaving the desired output byte behind
	 */

	.byte	0x79,0x01^FIX1L			// 0122: 79 01		jns	L2				//* jump is sign bit clear
	.byte	0x43^FIX1H			// 0124: 43		inc	%bx				//* shift output position

	/*
	 * step-2C: load next input byte
	 *
	 * Load next byte from input by incrementing %di, decrement %di to keep the output position
	 * Inject the loaded byte into the low-byte of the hash for maximum effect.
	 * Injecting into the low-byte has an undesired side-effect for step-2D, so inject into the high-byte.
	 * Injection is a memory-memory operation, use %ah as intermediate byte. %ax is initially 0x0000.
	 */
L2:
	.byte	0x6b,0x6d,OFSTEXT-1,SEEDTEXT	// 0125: 6b 6d X X	imul	$SEEDTEXT,OFSTEXT-1(%di),%bp	//* use input text as word to generate next number
	.byte	0x47^FIX2L			// 0129: 47		inc	%di				//* shift input position
	.byte	0x4b^FIX2H			// 012a: 4b		dec	%bx				//* increment distance input/output, decrement because %bx is used negatively
	.byte	0x31,0x69,OFSHEAD		// 012b: 31 69 X	xorw	%bp,OFSHEAD(%bx,%di)		//* Inject entropy into HEAD

	/*
	 * step-2D: loop until finished
	 *
	 * Injecting where the result is zero can be used as trigger to indicate end-of-sequence.
	 * This however should not happen for the low-byte because emitting a zero is a valid situation.
	 */
	.byte	0x75,0xea^FIX3L		// 012e: 75 ea		jne	stage2Start			//* repeat until end-of-sequence

	// insert CRLF
	.byte 0x35^FIX3H, 0x0d, 0x0a
						// 12e:	35 0d 0a             	xor    $0xa0d,%ax

stage3Start:
	// Initial hash, and later first instruction of stage3
	.byte	HASHHEADL, HASHHEADH		

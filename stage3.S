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
 * Stage3 is basically a radix converter for big numbers
 *
 * text2binary:
 *    pool = 0;
 *    while (*inPtr) {
 *      if (isAlpha(*inPtr))
 *        pool = pool * 13 + decodeRadix13(*inPtr++);
 *      else
 *        pool = pool * 10 + decodeRadix10(*inPtr++);
 *
 *      if (pool & 0xff00) {
 *        // pool contains a radix256 number, extract a byte
 *        *outPtr++ = pool;
 *        pool >>= 8;
 *      }
 *    }
 */

	.code16

// load configuration
#include "stage1.inc"

Stage3Start:

// inherit %bp and %di from stage2.
// use %dx as pool, %ax as enum

	clr	%dx			// clear pool

GetEnum:
	movzx	OFSTEXT(%di),%ax	// Read next input character
	inc	%di			// shift input position
	dec	%bx			// increment distance input/output, decrement because %bx is used negatively

	subb	$'a'-2,%al		// test for alpha. Need the extra 2 for the charset decoding
	jae	GotAlpha		// yes, jump higher or same
	subb	$'0'-'a'+2,%al		// test for numeric (and compensate for the previous -2)
	jb	GetEnum			// no, next char

GotNumeric:
	imul    $10,%dx,%dx		// grow pool for radix10
	jmp	GotEnum

GotAlpha:
	imul	$13,%dx,%dx		// grow pool for radix13

	shr	%al			// divide by 2
	jnc	GotEnum			// jump if input was even
	cmp	$9,%al			// if "vxz"
	je	GotEnum
	sub	$7,%al			// then shift to fill gap

GotEnum:
	addw	%ax,%dx			// inject

	orb	%dh,%dh			// test if byte present
	je	GetEnum			// no, keep lurking

	cmp	$STAGE3EOS,%dx		// test for end-of-sequence
	je	Stage4Start		// jump if found

	movb	%dl,OFSHEAD(%bx,%di)	// save byte
	inc	%bx			// shift output position

	shrw	$8,%dx			// reduce pool
	jmp	GetEnum			// loop

Stage4Start:

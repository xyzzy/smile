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
 * This program searches for valid combinations of immediate and offsets.
 * It does this by trying all possible values and dropping those that do not pass validation.
 *
 * The `imul` instruction can be either a byte or a word.
 * The addresses used here are assuming they are all bytes and otherwise compensated internally.
 * Addresses listed in `stage12.lst` can differ from runtime.
 * Run `make unpatched.com` to create the listing to extract their values and paste below.
 *
 * Stage2 needs to be able to access the heads of output and input which are located directly after stage2.
 */

/*
 * Changelog:
 *
 * @date 2021-02-06 17:54:59
 *
 * With the first instruction being a `imul` to load %di, it uses %si as index register which points to the start of stage1.
 * The lowest register offset is 0x30.
 * This implies that the hash needs to be located at %0x0130 for initial %si=0x0100.
 * Stage1+stage2 combined is smaller than 0x30 bytes requiring padding.
 * Padding can be easily achieved by using word multipliers instead of byte multipliers.
 * The location of the output HEAD is located directly after stage2, which is also a hash.
 * Sharing the same hash location for stage1+3 implies that stage1 determines the initial hash value (used to be genStage3)
 */


"use strict";

/*
 * Fixup locations and values taken from `unpatched.lst`
 */

// SEED/multiplier for stage3
// NOTE: should be even for best results
// NOTE: This is the authoritative declaration
let SEED = 0x6e72;

let ADDR1 = 0x0124;
let WORD1 = 0x4304;
let ADDR2 = 0x0129;
let WORD2 = 0x4b47;
let ADDR3 = 0x012e;
let WORD3 = 0xe575;

let stage2Start = 0x011b;			// start location of stage2
let stage2Size = 0x0130 - 0x011b;		// length of stage2

let addrHEAD = stage2Start + stage2Size;	// directly after stage2 is the output head containing the number generator hash
let addrTEXT = addrHEAD + 2;			// directly after HEAD in the first text byte

/*
 * Initial values for msdos/freedos
 * NOTE: debug.exe sets %si,%di to 0x0000
 */

let initialHash = 0x20cd;	// %bx=0x0000, (%bx)=0x20cd
let initialSI = 0x0100;		// %si=0x0100
let initialDI = 0xfffe;		// %di=0xfffe

function toHex(n, width) {
	let s = "0000" + n.toString(16);
	if (n >= 0x100 || width === 2)
		return "0x" + s.substr(-4, 4);
	else
		return "0x" + s.substr(-2, 2);
}

function toChar(n) {
	return '\'' + String.fromCharCode(n) + '\'';
}

/*
 * safe ascii characters in order of desirability
 */
const safe =
	"acemnorsuvwxz" +
	"bdfghijklpqty" +
	"0123456789";

const safeChar = new Array(safe.length);
const safeVal = new Uint8Array(safe.length);
// the following contain the scores
const isSafe8 = new Uint8Array(256);
const isSafe16 = new Uint8Array(65536);

for (let i = 0; i < safe.length; i++) {
	safeChar[i] = safe.substr(i, 1);
	safeVal[i] = safe.charCodeAt(i);
	isSafe8[safeVal[i]] = (i < 13) ? 1 : (i < 26) ? 2 : 3; // score
}
for (let i = 0; i < 65536; i++)
	if (isSafe8[i >> 8] && isSafe8[i & 0xff])
		isSafe16[i] = isSafe8[i >> 8] + isSafe8[i & 0xff];

/*
 * step-1: Create %di from hash located at end of stage-2
 *	   NOTE: the initial hash must be even
 *
 *	imul	$IMM1,OFSHASH(%bp,%di),%di	// load %di
 */

// indexed by latest generated number
let step1Data = new Array(65536);

let cnt = 0;
for (let imm = 0; imm < 256; imm++) {
	if (isSafe8[imm]) {
		for (let hash = 0; hash < 65536; hash++) {
			if (isSafe16[hash] && (hash & 1) === 0) {

				// next number
				let di = (hash * imm) & 0xffff;

				// directly after stage2 is the output head containing the number generator hash
				let ofsHEAD = stage2Start + stage2Size;
				// directly after HEAD in the first text byte
				let OFSTEXT = ofsHEAD + 2;

				// locations should be accessible
				if (!isSafe8[ADDR1 - di] || !isSafe8[ADDR2 - di] || !isSafe8[ADDR3 - di] || !isSafe8[OFSTEXT - di])
					continue;

				let score = isSafe8[imm];

				// valid combo
				if (!step1Data[di] || score < step1Data[di].score) {
					step1Data[di] = {
						score: score,	// desirability
						IMM1: imm,	// multiplier
						di: di,		// next number
						hash: hash,	// number hash
					};
					cnt++;
				}
			}
		}
	}
}

for (let imm = 0; imm < 65536; imm++) {
	if (isSafe16[imm]) {
		for (let hash = 0; hash < 65536; hash++) {
			if (isSafe16[hash] && (hash & 1) === 0) {

				// next number
				let di = (hash * imm) & 0xffff;

				// locations should be accessible
				if (!isSafe8[ADDR1 - di] || !isSafe8[ADDR2 - di] || !isSafe8[ADDR3 - di] || !isSafe8[addrTEXT - di])
					continue;

				let score = isSafe16[imm] + 256; // add word penalty

				// valid combo
				if (!step1Data[di] || score < step1Data[di].score) {
					step1Data[di] = {
						score: score,	// desirability
						IMM1: imm,	// multiplier
						hash: hash,	// initial hash
						di: di,		// resulting %di
					};
					cnt++;
				}
			}
		}
	}
}

if (!cnt) {
	console.error("step-1 failed");
	process.exit(1);
}
console.error("Step-1 has " + cnt + " candidates");

/*
 * step-2: Add entropy to the number generator
 *
 *	imul	$IMM2,(%bx),%si		// next number
 *	xor	%si,(%bx)		// update hash
 */

// indexed by latest generated number
let step2Data = new Array(65536);

cnt = 0;
for (let imm = 0; imm < 256; imm++) {
	if (isSafe8[imm]) {
		// next number
		let si = (initialHash * imm) & 0xffff;
		let hash = si ^ initialHash;

		let score = isSafe8[imm];

		// valid combo
		if (!step2Data[hash] || score < step2Data[hash].score) {
			step2Data[hash] = {
				score: score,	// desirability
				IMM2: imm,	// multiplier
				si: si,		// next number
				hash: hash,	// number hash
			};
			cnt++;
		}
	}
}
for (let imm = 0; imm < 65536; imm++) {
	if (isSafe16[imm]) {
		// next number
		let si = (initialHash * imm) & 0xffff;
		let hash = si ^ initialHash;

		let score = isSafe16[imm] + 256; // add word penalty

		// valid combo
		if (!step2Data[hash] || score < step2Data[hash].score) {
			step2Data[hash] = {
				score: score,	// desirability
				IMM2: imm,	// multiplier
				si: si,		// next number
				hash: hash,	// number hash
			};
			cnt++;
		}
	}
}

if (!cnt) {
	console.error("step-2 failed");
	process.exit(1);
}
console.error("Step-2 has " + cnt + " candidates");

/*
 * step-3: Generate number and patch stage2
 *
 *  	imul	$IMM3,(%bx),%si	// next number
 * 	xor	%si,OFSMEM1(%di)
 * 	xor	%si,OFSMEM2(%di)
 */

// indexed by latest generated number
let step3Data = new Array(65536);

cnt = 0;
for (let iStep2 = 0; iStep2 < 65536; iStep2++) {
	let step2 = step2Data[iStep2];
	if (step2) {
		let mem1H = WORD1 >> 8;
		let mem1L = WORD1 & 0xff;
		let mem2H = WORD2 >> 8;
		let mem2L = WORD2 & 0xff;

		// next number
		for (let imm = 0; imm < 256; imm++) {
			if (isSafe8[imm]) {

				let si = (step2.hash * imm) & 0xffff;
				let siH = si >> 8;
				let siL = si & 0xff;

				// test if combo is safe
				if (isSafe8[mem1L ^ siL] && isSafe8[mem1H ^ siH] && isSafe8[mem2L ^ siL] && isSafe8[mem2H ^ siH]) {

					let score = step2.score + isSafe8[imm];

					// valid combo
					if (!step3Data[si] || score < step3Data[si].score) {
						step3Data[si] = {
							score: score,		// desirability
							IMM3: imm,		// multiplier
							si: si,			// next number
							step2: step2,		// link to previous number
						};
						cnt++;
					}
				}
			}
		}

		// next number
		for (let imm = 0; imm < 65536; imm++) {
			if (isSafe16[imm]) {

				let si = (step2.hash * imm) & 0xffff;
				let siH = si >> 8;
				let siL = si & 0xff;

				// test if combo is safe
				if (isSafe8[mem1L ^ siL] && isSafe8[mem1H ^ siH] && isSafe8[mem2L ^ siL] && isSafe8[mem2H ^ siH]) {

					let score = step2.score + isSafe16[imm] + 256; // add word penalty

					// valid combo
					if (!step3Data[si] || score < step3Data[si].score) {
						step3Data[si] = {
							score: score,		// desirability
							IMM3: imm,		// multiplier
							si: si,			// next number
							step2: step2,		// link to previous number
						};
						cnt++;
					}
				}
			}
		}
	}
}
if (!cnt) {
	console.error("step-3 failed");
	process.exit(1);
}
console.error("Step-3 has " + cnt + " candidates");

/*
 *  step-4: Generate number and patch stage2
 *
 *  	imul	$IMM4,(%bx),%si	// next number
 * 	xor	%si,OFSMEM3(%di)
 */

// indexed by latest generated number
let step4Data = new Array(65536);

cnt = 0;
for (let iStep3 = 0; iStep3 < 65536; iStep3++) {
	let step3 = step3Data[iStep3];
	if (step3) {
		let step2 = step3.step2;
		let mem3H = WORD3 >> 8;
		let mem3L = WORD3 & 0xff;

		// next number
		for (let imm = 0; imm < 256; imm++) {
			if (isSafe8[imm]) {

				let si = (step2.hash * imm) & 0xffff;
				let siH = si >> 8;
				let siL = si & 0xff;

				// test if combo is safe
				if (isSafe8[mem3L ^ siL] && isSafe8[mem3H ^ siH]) {

					let score = step3.score + isSafe8[imm];

					// valid combo
					if (!step4Data[si] || score < step4Data[si].score) {
						step4Data[si] = {
							score: score,		// desirability
							IMM4: imm,		// multiplier
							si: si,			// next number
							step3: step3,		// link to previous number
						};
						cnt++;
					}
				}
			}
		}

		// next number
		for (let imm = 0; imm < 65536; imm++) {
			if (isSafe16[imm]) {

				let si = (step2.hash * imm) & 0xffff;
				let siH = si >> 8;
				let siL = si & 0xff;

				// test if combo is safe
				if (isSafe8[mem3L ^ siL] && isSafe8[mem3H ^ siH]) {

					let score = step3.score + isSafe16[imm] + 256; // add word penalty

					// valid combo
					if (!step4Data[si] || score < step4Data[si].score) {
						step4Data[si] = {
							score: score,		// desirability
							IMM4: imm,		// multiplier
							si: si,			// next number
							step3: step3,		// link to previous number
						};
						cnt++;
					}
				}
			}
		}
	}
}
if (!cnt) {
	console.error("step-4 failed");
	process.exit(1);
}
console.error("Step-4 has " + cnt + " candidates");

/*
 * Cross product for combinations having exactly 1 WORD intermediate
 * With a given initial %di of 0xfffe and an offset of '0' (0x30), that would place the Head hash at 0x12e
 */

let best = null;
cnt = 0;
for (let iStep1 = 0; iStep1 < 65536; iStep1++) {
	let step1 = step1Data[iStep1];
	if (step1) {

		for (let iStep4 = 0; iStep4 < 65536; iStep4++) {
			let step4 = step4Data[iStep4];
			if (step4) {

				// select only triple word combos
				let score = step1.score + step4.score;
				let numWords = score >> 8;  // high byte contains number or words

				if (numWords === 2) {
					// found combo
					cnt++;

					// select only the best
					if (!best || score < best.score) {
						let step3 = step4.step3;
						let step2 = step3.step2;

						best = {
							score: score,
							step1: step1,
							step4: step4,
						};
					}
				}
			}
		}
	}
}

if (!cnt) {
	console.error("Collect failed");
	process.exit(1);
}
console.error("Collect has " + cnt + " candidates");

{
	/*
	 * display best candidate
	 */

	let step4 = best.step4;
	let step3 = step4.step3;
	let step2 = step3.step2;
	let step1 = best.step1;
	let di = step1.di;

	console.log("// Generated by \"" + process.argv[1] + "\"");
	// console.log("// "+JSON.stringify(best));
	console.log("// Stage-1 config:");
	console.log("HASH = " + toHex(step1.hash, 2));
	console.log("HASHH = " + toChar(step1.hash >> 8, 1) + " \t// decoder hash HI-byte");
	console.log("HASHL = " + toChar(step1.hash & 0xff, 1) + " \t// decoder hash LO-byte");
	console.log("SEED = " + toHex(SEED, 2));
	console.log("SEEDH = " + toChar(SEED >> 8, 1) + " \t// decoder seed HI-byte");
	console.log("SEEDL = " + toChar(SEED & 0xff, 1) + " \t// decoder seed LO-byte");
	console.log("OFSHASH = " + toChar((addrHEAD - initialSI) & 0xffff) + " \t// %si offset containing number generator hash, hash=" + toHex(step1.hash));
	console.log("OFSHEAD = " + toChar((addrHEAD - di) & 0xffff) + " \t// %di offset to output HEAD containing number generator hash");
	console.log("OFSTEXT = " + toChar((addrTEXT - di) & 0xffff) + " \t// %di offset to input TEXT containing the next character");
	console.log("IMM1 = " + toHex(step1.IMM1) + " \t// multiplier for step-1. %di=" + toHex(di, 2));
	console.log("IMM2 = " + toHex(step2.IMM2) + " \t// multiplier for step-2. %si=" + toHex(step2.si, 2) + ", hash=" + toHex(step2.hash, 2));
	console.log("IMM3 = " + toHex(step3.IMM3) + " \t// multiplier for step-3. %si=" + toHex(step3.si, 2));
	console.log("IMM4 = " + toHex(step4.IMM4) + " \t// multiplier for step-4. %si=" + toHex(step4.si, 2));
	console.log("// Patch config:");
	console.log("OFSMEM1 = " + toChar(ADDR1 - di) + " \t// patch offset for step-3A");
	console.log("FIX1H = " + toHex(step3.si >> 8, 1) + " \t// patch for HI-byte");
	console.log("FIX1L = " + toHex(step3.si & 0xff, 1) + " \t// patch for LO-byte");
	console.log("OFSMEM2 = " + toChar(ADDR2 - di) + " \t// patch offset for step-3B");
	console.log("FIX2H = " + toHex(step3.si >> 8, 1) + " \t// patch for HI-byte");
	console.log("FIX2L = " + toHex(step3.si & 0xff, 1) + " \t// patch for LO-byte");
	console.log("OFSMEM3 = " + toChar(ADDR3 - di) + " \t// patch offset for step-4");
	console.log("FIX3H = " + toHex(step4.si >> 8, 1) + " \t// patch for HI-byte");
	console.log("FIX3L = " + toHex(step4.si & 0xff, 1) + " \t// patch for LO-byte");
}

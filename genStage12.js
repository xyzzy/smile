"use strict";

/*
 * Fixup locations and values taken from `unpatched.lst`
 */

let ADDR1 = 0x0128;
let WORD1 = 0x4304;
let ADDR2 = 0x012d;
let WORD2 = 0x4b47;
let ADDR3 = 0x0132;
let WORD3 = 0xe575;
let SIZE = 0x0134 + 1; // +1 to access first byte state3 data

/*
 * Initial values for msdos/freedos
 * NOTE: debug.exe sets %si,%di to 0x0000
 */

let initialHash = 0x20cd;	// %bx=0x0000, (%bx)=0x20cd
let initialSI = 0x0100;		// %si=0x0100
let initialDI = 0xfffe;		// %di=0xfffe

let rangeAddr = ADDR1;		// address of modifiable range
let rangeLen = SIZE - ADDR1;	// length of modifiable range


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
 * step-1: Step-2 does not generate enough diversity for %di, generate an additional number
 *
 *	imul	$IMM1,(%bx),%si		// next number
 *	xor	%si,(%bx)		// update hash
 */

// indexed by latest generated number
let step1Data = new Array(65536);

let cnt = 0;
for (let imm = 0; imm < 256; imm++) {
	if (isSafe8[imm]) {
		// next number
		let si = (initialHash * imm) & 0xffff;
		let hash = si ^ initialHash;

		let score = isSafe8[imm];

		// valid combo
		if (!step1Data[hash] || score < step1Data[hash].score) {
			step1Data[hash] = {
				score: score,	// desirability
				IMM1: imm,	// multiplier
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

		let score = isSafe16[imm] + 10; // penalty for word

		// valid combo
		if (!step1Data[hash] || score < step1Data[hash].score) {
			step1Data[hash] = {
				score: score,	// desirability
				IMM1: imm,	// multiplier
				si: si,		// next number
				hash: hash,	// number hash
			};
			cnt++;
		}
	}
}

if (!cnt) {
	console.error("step-1 failed");
	process.exit(1);
}
console.error("Step-1 has " + cnt + " candidates");

/*
 * STEP-2: Generate number and initialize %di so that it points to the anchor
 *	   Use initial value of %di, does not work when run from debug.exe
 *
 *	imul	$IMM2,(%bx),%si		// next number
 *	xor	OFSDI(%bx,%si),%di	// load %di
 */

// indexed by latest generated number
let step2Data = new Array(65536);

cnt = 0;
for (let iStep1 = 0; iStep1 < 65536; iStep1++) {
	let step1 = step1Data[iStep1];
	if (step1) {
		for (let imm = 0; imm < 256; imm++) {
			if (isSafe8[imm]) {
				// next number
				let hash = ((step1.hash * imm) & 0xffff) ^ step1.hash;
				// what would %di be
				let di = initialDI ^ hash;
				let ofs = (rangeAddr - di) & 0xffff;

				// does %di span anchor range.
				// NOTE: this is a temporary test, add extra expansion space
				if (ofs >= 0x61 - 6 && ofs + rangeLen <= 0x7a - 6) {

					let score = step1.score + isSafe8[imm];

					// valid combo
					if (!step2Data[hash] || score < step2Data[hash].score) {
						step2Data[hash] = {
							score: score,		// desirability
							hash: step1.hash,	// NOTE: hash is not updates
							IMM2: imm,		// multiplier
							di: di,			// estimated value of %di
							OFSDI: ofs,
							step1: step1,
						};
						cnt++;
					}
				}
			}
		}
		for (let imm = 0; imm < 65536; imm++) {
			if (isSafe16[imm]) {
				// next number
				let hash = ((step1.hash * imm) & 0xffff) ^ step1.hash;
				// what would %di be
				let di = initialDI ^ hash;
				let ofs = (rangeAddr - di) & 0xffff;

				// does %di span anchor range.
				// NOTE: this is a temporary test, add extra expansion space
				if (ofs >= 0x61 - 6 && ofs + rangeLen <= 0x7a - 6) {

					let score = step1.score + isSafe16[imm] + 10; // penalty for word

					// valid combo
					if (!step2Data[hash] || score < step2Data[hash].score) {
						step2Data[hash] = {
							score: score,		// desirability
							hash: step1.hash,	// NOTE: hash is not updates
							IMM2: imm,		// multiplier
							di: di,			// value of %di
							OFSDI: ofs,
							step1: step1,
						};
						cnt++;
					}
				}
			}
		}
	}
}

if (!cnt) {
	console.error("step-2 failed");
	process.exit(1);
}
console.error("Step-2 has " + cnt + " candidates");

/*
 * step-3: Step-4 does not generate enough diversity for patches, generate an additional number
 *
 *	imul	$IMM3,(%bx),%si		// next number
 *	xor	%si,(%bx)		// update hash
 */

// indexed by latest generated number
let step3Data = new Array(65536);

cnt = 0;
for (let iStep2 = 0; iStep2 < 65536; iStep2++) {
	let step2 = step2Data[iStep2];
	if (step2) {
		for (let imm = 0; imm < 256; imm++) {
			if (isSafe8[imm]) {
				// next number
				let si = (step2.hash * imm) & 0xffff;
				let hash = si ^ step2.hash;

				let score = step2.score + isSafe8[imm];

				if (!step3Data[hash] || score < step3Data[hash].score) {
					step3Data[hash] = {
						score: score,		// desirability
						IMM3: imm,		// multiplier
						si: si,			// next number
						hash: hash,		// updated hash
						step2: step2,		// link to previous number
					};
					cnt++;
				}
			}
		}
		for (let imm = 0; imm < 65536; imm++) {
			if (isSafe16[imm]) {
				// next number
				let si = (step2.hash * imm) & 0xffff;
				let hash = si ^ step2.hash;

				let score = step2.score + isSafe16[imm] + 10; // penalty for word

				if (!step3Data[hash] || score < step3Data[hash].score) {
					step3Data[hash] = {
						score: score,		// desirability
						IMM3: imm,		// multiplier
						si: si,			// next number
						hash: hash,		// updated hash
						step2: step2,		// link to previous number
					};
					cnt++;
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
 * STEP-4: Generate number and patch stage2
 *
 *  	imul	$IMM4,(%bx),%si	// next number
 * 	xor	%si,OFSMEM1(%di)
 * 	xor	%si,OFSMEM2(%di)
 */

// indexed by latest generated number
let step4Data = new Array(65536);

cnt = 0;
for (let iStep3 = 0; iStep3 < 65536; iStep3++) {
	let step3 = step3Data[iStep3];
	if (step3) {
		let mem1H = WORD1 >> 8;
		let mem1L = WORD1 & 0xff;
		let mem2H = WORD2 >> 8;
		let mem2L = WORD2 & 0xff;

		// next number
		for (let imm = 0; imm < 256; imm++) {
			if (isSafe8[imm]) {

				let si = (step3.hash * imm) & 0xffff;
				let siH = si >> 8;
				let siL = si & 0xff;
				let hash = step3.hash; // NOTE: hash is not updated

				// test if combo is safe
				if (isSafe8[mem1L ^ siL] && isSafe8[mem1H ^ siH] &&
					isSafe8[mem2L ^ siL] && isSafe8[mem2H ^ siH]) {

					let score = step3.score + isSafe8[imm];

					// valid combo
					if (!step4Data[hash] || score < step4Data[hash].score) {
						step4Data[hash] = {
							score: score,		// desirability
							IMM4: imm,		// multiplier
							si: si,			// next number
							hash: hash,		// hash
							FIX1H: mem1H ^ siH,
							FIX1L: mem1L ^ siL,
							FIX2H: mem2H ^ siH,
							FIX2L: mem2L ^ siL,
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

				let si = (step3.hash * imm) & 0xffff;
				let siH = si >> 8;
				let siL = si & 0xff;
				let hash = step3.hash; // NOTE: hash is not updated

				// test if combo is safe
				if (isSafe8[mem1L ^ siL] && isSafe8[mem1H ^ siH] &&
					isSafe8[mem2L ^ siL] && isSafe8[mem2H ^ siH]) {

					let score = step3.score + isSafe16[imm] + 10; // penalty for word;

					// valid combo
					if (!step4Data[hash] || score < step4Data[hash].score) {
						step4Data[hash] = {
							score: score,		// desirability
							IMM4: imm,		// multiplier
							si: si,			// next number
							hash: hash,		// hash
							FIX1H: mem1H ^ siH,
							FIX1L: mem1L ^ siL,
							FIX2H: mem2H ^ siH,
							FIX2L: mem2L ^ siL,
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
 * STEP-5: Generate number and patch stage2
 *
 *  	imul	$IMM5,(%bx),%si	// next number
 * 	xor	%si,OFSMEM3(%di)
 */

// indexed by latest generated number
let step5Data = new Array(65536);

cnt = 0;
for (let iStep4 = 0; iStep4 < 65536; iStep4++) {
	let step4 = step4Data[iStep4];
	if (step4) {
		let mem3H = WORD3 >> 8;
		let mem3L = WORD3 & 0xff;

		// next number
		for (let imm = 0; imm < 256; imm++) {
			if (isSafe8[imm]) {

				let si = (step4.hash * imm) & 0xffff;
				let siH = si >> 8;
				let siL = si & 0xff;
				let hash = step4.hash; // NOTE: hash is not updated

				// test if combo is safe
				if (isSafe8[mem3L ^ siL] && isSafe8[mem3H ^ siH]) {

					let score = step4.score + isSafe8[imm];

					// valid combo
					if (!step5Data[hash] || score < step5Data[hash].score) {
						step5Data[hash] = {
							score: score,		// desirability
							IMM5: imm,		// multiplier
							si: si,			// next number
							hash: hash,		// hash
							FIX3H: mem3H ^ siH,
							FIX3L: mem3L ^ siL,
							step4: step4,		// link to previous number
						};
						cnt++;
					}
				}
			}
		}

		// next number
		for (let imm = 0; imm < 65536; imm++) {
			if (isSafe16[imm]) {

				let si = (step4.hash * imm) & 0xffff;
				let siH = si >> 8;
				let siL = si & 0xff;
				let hash = step4.hash; // NOTE: hash is not updated

				// test if combo is safe
				if (isSafe8[mem3L ^ siL] && isSafe8[mem3H ^ siH]) {

					let score = step4.score + isSafe16[imm] + 10; // penalty for word;

					// valid combo
					if (!step5Data[hash] || score < step5Data[hash].score) {
						step5Data[hash] = {
							score: score,		// desirability
							IMM5: imm,		// multiplier
							si: si,			// next number
							hash: hash,		// hash
							FIX3H: mem3H ^ siH,
							FIX3L: mem3L ^ siL,
							step4: step4,		// link to previous number
						};
						cnt++;
					}
				}
			}
		}
	}
}
if (!cnt) {
	console.error("step-5 failed");
	process.exit(1);
}
console.error("Step-5 has " + cnt + " candidates");

/*
 * Locate best candidate
 */

let best = null;
for (let iStep5 = 0; iStep5 < 65536; iStep5++) {
	let step5 = step5Data[iStep5];
	if (step5) {
		let di = step5.step4.step3.step2.di;

		// how many multipliers with value >= 256
		let extra = step5.score % 10;
		// %di should be compensate for the extra bytes
		di -= extra;

		// revalidate
		let ofs = (rangeAddr - di) & 0xffff;
		if (ofs >= 0x61 && ofs + rangeLen <= 0x7a) {

			// valid candidate, select on score
			if (!best || step5.score < best.score) {
				best = step5;
				best.di = di; // actual value of %di
				best.OFSDI = ofs; // multiplier for %di
			}
		}
	}
}

if (!best) {
	console.error("failed");
	process.exit(1);
}

{
	let step5 = best;
	let step4 = step5.step4;
	let step3 = step4.step3;
	let step2 = step3.step2;
	let step1 = step2.step1;

	function toHex(n) {
		let s = "0000" + n.toString(16);
		if (n >= 0x100)
			return "0x" + s.substr(-4, 4);
		else
			return "0x" + s.substr(-2, 2);
	}

	function toChar(ch) {
		return '\'' + String.fromCharCode(ch) + '\'';
	}

	let di = step5.di;

	console.log("// STAGE-1 config");
	console.log("// SI=" + toHex(step1.si) + ',' + toHex(step3.si) + ',' + toHex(step4.si) + ',' + toHex(step5.si));
	console.log("OFSDI = " + toChar(step5.OFSDI) + " \t// multiplier for initial %di");
	console.log("HEAD = " + toChar(SIZE - di) + " \t// %di offset to encoded stage3 DATA");
	console.log("IMM1 = " + toHex(step1.IMM1) + " \t// multiplier for step-1");
	console.log("IMM2 = " + toHex(step2.IMM2) + " \t// multiplier for step-2");
	console.log("IMM3 = " + toHex(step3.IMM3) + " \t// multiplier for step-3");
	console.log("IMM4 = " + toHex(step4.IMM4) + " \t// multiplier for step-4");
	console.log("IMM5 = " + toHex(step5.IMM5) + " \t// multiplier for step-5");
	console.log("");
	console.log("// Patch config");
	console.log("OFSMEM1 = " + toChar(ADDR1 - di) + " \t// patch offset for step-4");
	console.log("FIX1H = " + toChar(step4.FIX1H) + " \t// patch for HI-byte");
	console.log("FIX1L = " + toChar(step4.FIX1L) + " \t// patch for LO-byte");
	console.log("OFSMEM2 = " + toChar(ADDR2 - di) + " \t// patch offset for step-4");
	console.log("FIX2H = " + toChar(step4.FIX2H) + " \t// patch for HI-byte");
	console.log("FIX2L = " + toChar(step4.FIX2L) + " \t// patch for LO-byte");
	console.log("OFSMEM3 = " + toChar(ADDR3 - di) + " \t// patch offset for step-5");
	console.log("FIX3H = " + toChar(step5.FIX3H) + " \t// patch for HI-byte");
	console.log("FIX3L = " + toChar(step5.FIX3L) + " \t// patch for LO-byte");
}

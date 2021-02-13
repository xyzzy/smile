/*
 *  This file is part of smile: ASCII-safe binaries
 *
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
 *
 * Stage1 needs to be able to access the stage3 number generator hash.
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

let fs = require("fs");

let STAGE1BASE = 0x0100;	// designed start of stage1
let STAGE3BASE = 0x0130;	// designed start of stage3. 0x0130-0x0139 is valid range.
let INITSI = 0x0100;		// initial value of %si
let INITHASH = 0x20cd;		// initial value of (%bx)
let SEEDHEAD = 0x6e6e;		// word seed for output number generator.
let SEEDTEXT = 0x6e;		// byte seed for input text number generator.
let STAGE3EOS = 0x0100;		// stage3 end-of-sequence token.
let numPromote;			// number of bytes to expand to words
let STAGE3OFFSET;		 // end of stage2 + HEAD

// some generated hashes fail with `genStage2.js`. List those here
let excludeHash = [0x6668, 0x6962, 0x6534, 0x6632, 0x3236];

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
 * Helpers
 */

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

function loadConfig(fileName) {

	// load configuration file
	let lines;
	try {
		lines = fs.readFileSync(fileName).toString().split("\n");
	} catch (e) {
		console.error("Error: Failed to load \"" + fileName + "\", " + e);
		process.exit(1);
	}

	// split lines into key/value pairs and load into config.
	let config = {};
	for (let i in lines) {
		// split line
		let [k, v] = lines[i].split('=');

		if (k && v) {
			// store in config
			config[k] = Number.parseInt(v);
		}
	}

	return config;
}

function saveConfig(fileName, args) {
	// convert integer values to hex
	for (let k in args) {
		let v = args[k];
		if (Number.isInteger(v))
			args[k] = toHex(v);
	}

	// join args together
	let lines = "";
	for (let k in args)
		lines += k + '=' + args[k] + '\n';

	// write to file
	try {
		fs.writeFileSync(fileName, lines);
	} catch (e) {
		console.error("Error: Failed to save \"" + fileName + "\", " + e);
		process.exit(1);
	}
}

/*
 * Load command line
 */

function usage() {
	console.error("usage: <stage1.inc> <stage12.com>");
	console.error("        --config=<filename>   Makefile configuration.");
	console.error("        --STAGE1BASE=<value>  Designed start stage1.  [default=" + toHex(STAGE1BASE, 2) + "]");
	console.error("        --STAGE3BASE=<value>  Designed start stage3.  [default=" + toHex(STAGE3BASE, 2) + "]");
	console.error("        --INITSI=<value>      Initial value of %si.   [default=" + toHex(INITSI, 2) + "]");
	console.error("        --INITHASH=<value>    Initial value of (%bx). [default=" + toHex(INITHASH, 2) + "]");
	console.error("        --SEEDHEAD=<value>    Word seed for output number generator. [default=" + toHex(SEEDHEAD, 2) + "]");
	console.error("        --SEEDTEXT=<value>    Byte seed for input number generator. [default=" + toHex(SEEDTEXT, 1) + "]");
	console.error("        --STAGE3EOS=<value>   End-of-sequence token.  [default=" + toHex(STAGE3EOS, 2) + "]");
	process.exit(1);
}

let argv = require('minimist')(process.argv.slice(2), {});
let args = [];
let configFilename;
let config;

for (const opt in argv) {
	if (opt === "_") {
		args = argv[opt];
	} else if (opt === "STAGE1BASE") {
		STAGE1BASE = Number.parseInt(argv[opt]);
	} else if (opt === "STAGE3BASE") {
		STAGE3BASE = Number.parseInt(argv[opt]);
		if (STAGE3BASE - STAGE1BASE < 0x30 || STAGE3BASE - STAGE1BASE > 0x39) {
			console.error("Error: STAGE3BASE is out of range");
			process.exit(1);
		}
	} else if (opt === "INITSI") {
		INITSI = Number.parseInt(argv[opt]);
	} else if (opt === "INITHASH") {
		INITHASH = Number.parseInt(argv[opt]);
	} else if (opt === "SEEDHEAD") {
		SEEDHEAD = Number.parseInt(argv[opt]);
		if (!isSafe16[SEEDHEAD]) {
			console.error("Error: SEEDHEAD is not ascii-safe");
			process.exit(1);
		}
	} else if (opt === "SEEDTEXT") {
		SEEDTEXT = Number.parseInt(argv[opt]);
		if (!isSafe8[SEEDTEXT]) {
			console.error("Error: seedtext is not ascii-safe");
			process.exit(1);
		}
	} else if (opt === "STAGE3EOS") {
		STAGE3EOS = Number.parseInt(argv[opt]);
		if (STAGE3EOS < 0x0100 || STAGE3EOS > 0xff * 10) {
			console.error("Error: STAGE3EOS is out of range");
			process.exit(1);
		}
	} else if (opt === "config") {
		configFilename = argv[opt];
		// load config
		config = loadConfig(configFilename);
		// values of interest
		if (config.STAGE1BASE)
			STAGE1BASE = config.STAGE1BASE;
		if (config.STAGE3BASE)
			STAGE3BASE = config.STAGE3BASE;
		if (config.INITSI)
			INITSI = config.INITSI;
		if (config.INITHASH)
			INITHASH = config.INITHASH;
		if (config.SEEDHEAD)
			SEEDHEAD = config.SEEDHEAD;
		if (config.SEEDTEXT)
			SEEDTEXT = config.SEEDTEXT;
		if (config.STAGE3EOS)
			STAGE3EOS = config.STAGE3EOS;
	} else if (opt === "h" || opt === "help") {
		usage();
	} else {
		usage();
	}
}
if (args.length < 2)
	usage();

console.log("#Using: " + JSON.stringify({
	STAGE1BASE: toHex(STAGE1BASE, 2),
	STAGE3BASE: toHex(STAGE3BASE, 2),
	INITSI: toHex(INITSI, 2),
	INITHASH: toHex(INITHASH, 2),
	SEEDHEAD: toHex(SEEDHEAD, 2),
	SEEDTEXT: toHex(SEEDTEXT, 2),
	STAGE3EOS: toHex(STAGE3EOS, 2),
}));

// update actual values
STAGE3OFFSET = STAGE3BASE - STAGE1BASE + 2; // end of stage2 + HEAD

let incFilename = args[0];
let comFilename = args[1];

/*
 * Load input file
 */

let data;
try {
	data = new Uint8Array(fs.readFileSync(comFilename));
} catch (e) {
	console.error("Failed to load input. " + e.toString());
	process.exit(1);
}

// Calculate how many byte the loaded image is missing to achieve address alignment.
numPromote = STAGE3BASE - (STAGE1BASE + data.length - 2);

if (!isSafe8[(STAGE3BASE - INITSI) & 0xffff]) {
	console.error("Error: STAGE3BASE is %si unreachable");
	process.exit(1);
}
if (numPromote > 4) {
	console.error("Error: STAGE3BASE too far away.");
	process.exit(1);
}
if (numPromote < -9) {
	console.error("Error: STAGE3BASE too close by.");
	process.exit(1);
}

/*
 * Locate ascii-unsafe values
 */

let fixups = [];

for (let i = 0; i < data.length; i++) {
	let addr = STAGE1BASE + numPromote + i;
	if (!isSafe8[data[i]]) {
		// test if it is a fixup word
		if (i + 1 < data.length && !isSafe8[data[i + 1]]) {
			// save fixup
			fixups.push({addr: addr, orig: data[i] + data[i + 1] * 256});
			// mark hi-byte fixed
			data[i + 1] = 0x6e;
		} else if (i === data.length - 2 - 1) {
			// last byte (before trailing hash) needs fixup
			fixups.push({addr: addr - 1, orig: data[i - 1] + data[i] * 256});
		} else {
			// byte needs fixup
			fixups.push({addr: addr, orig: data[i] + data[i + 1] * 256});
		}
	}
}

// remove \r\n
for (let i = fixups.length - 1; i >= 0; --i) {
	if (fixups[i].orig === 0x0a0d)
		fixups.splice(i, 1); // delete element
}


if (fixups.length !== 3) {
	console.error("Error: supporting only 3 fixups");
	for (let i = 0; i < fixups.length; i++)
		console.error(toHex(fixups[i].addr, 2) + ": " + toHex(fixups[i].orig, 1));
	process.exit(1);
}

// extract data
let {addr: FIXADDR1, orig: FIXWORD1} = fixups[0];
let {addr: FIXADDR2, orig: FIXWORD2} = fixups[1];
let {addr: FIXADDR3, orig: FIXWORD3} = fixups[2];

console.log(toHex(FIXADDR1, 2) + ": " + toHex(FIXWORD1, 2));
console.log(toHex(FIXADDR2, 2) + ": " + toHex(FIXWORD2, 2));
console.log(toHex(FIXADDR3, 2) + ": " + toHex(FIXWORD3, 2));

/*
 * step-1: Create %di from hash located at end of stage-2
 *	   NOTE: the initial hash must be even
 *
 *	imul	$SEEDDI,OFSHASH(%bp,%di),%di	// load %di
 */

// indexed by latest generated number
let step1Data = new Array(65536);

let cnt = 0;
for (let imm = 0; imm < 256; imm++) {
	if (isSafe8[imm]) {
		for (let hash = 0; hash < 65536; hash++) {
			if (isSafe16[hash]) {

				// next number
				let di = (hash * imm) & 0xffff;

				// locations should be accessible, including first 3 bytes of stage3.
				if (!isSafe8[FIXADDR1 - di] || !isSafe8[FIXADDR2 - di] || !isSafe8[FIXADDR3 - di] || !isSafe8[STAGE3BASE + 2 - di])
					continue;

				let score = isSafe8[imm];

				// valid combo
				if (!step1Data[di] || score < step1Data[di].score) {
					step1Data[di] = {
						score: score,	// desirability
						SEEDDI: imm,	// multiplier
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
			if (isSafe16[hash]) {

				// next number
				let di = (hash * imm) & 0xffff;

				// locations should be accessible, including first 3 bytes of stage3.
				if (!isSafe8[FIXADDR1 - di] || !isSafe8[FIXADDR2 - di] || !isSafe8[FIXADDR3 - di] || !isSafe8[STAGE3BASE + 2 - di])
					continue;

				let score = isSafe16[imm] + 256; // add word penalty

				// valid combo
				if (!step1Data[di] || score < step1Data[di].score) {
					step1Data[di] = {
						score: score,	// desirability
						SEEDDI: imm,	// multiplier
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
 *	imul	$SEEDSI,(%bx),%si	// next number
 *	xor	%si,(%bx)		// update hash
 */

// indexed by latest generated number
let step2Data = new Array(65536);

cnt = 0;
for (let imm = 0; imm < 256; imm++) {
	if (isSafe8[imm]) {
		// next number
		let si = (INITHASH * imm) & 0xffff;
		let hash = si ^ INITHASH;

		let score = isSafe8[imm];

		// valid combo
		if (!step2Data[hash] || score < step2Data[hash].score) {
			step2Data[hash] = {
				score: score,	// desirability
				SEEDSI: imm,	// multiplier
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
		let si = (INITHASH * imm) & 0xffff;
		let hash = si ^ INITHASH;

		let score = isSafe16[imm] + 256; // add word penalty

		// valid combo
		if (!step2Data[hash] || score < step2Data[hash].score) {
			step2Data[hash] = {
				score: score,	// desirability
				SEEDSI: imm,	// multiplier
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
 *  	imul	$SEEDFIX12,(%bx),%si	// next number
 * 	xor	%si,OFSFIX1(%di)
 * 	xor	%si,OFSFIX2(%di)
 */

// indexed by latest generated number
let step3Data = new Array(65536);

cnt = 0;
for (let iStep2 = 0; iStep2 < 65536; iStep2++) {
	let step2 = step2Data[iStep2];
	if (step2) {
		let fix1H = FIXWORD1 >> 8;
		let fix1L = FIXWORD1 & 0xff;
		let fix2H = FIXWORD2 >> 8;
		let fix2L = FIXWORD2 & 0xff;

		// next number
		for (let imm = 0; imm < 256; imm++) {
			if (isSafe8[imm]) {

				let si = (step2.hash * imm) & 0xffff;
				let siH = si >> 8;
				let siL = si & 0xff;

				// test if combo is safe
				if (isSafe8[fix1L ^ siL] && isSafe8[fix1H ^ siH] && isSafe8[fix2L ^ siL] && isSafe8[fix2H ^ siH]) {

					let score = step2.score + isSafe8[imm];

					// valid combo
					if (!step3Data[si] || score < step3Data[si].score) {
						step3Data[si] = {
							score: score,		// desirability
							SEEDFIX12: imm,		// multiplier
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
				if (isSafe8[fix1L ^ siL] && isSafe8[fix1H ^ siH] && isSafe8[fix2L ^ siL] && isSafe8[fix2H ^ siH]) {

					let score = step2.score + isSafe16[imm] + 256; // add word penalty

					// valid combo
					if (!step3Data[si] || score < step3Data[si].score) {
						step3Data[si] = {
							score: score,		// desirability
							SEEDFIX12: imm,		// multiplier
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
 *  	imul	$SEEDFIX3,(%bx),%si	// next number
 * 	xor	%si,OFSFIX3(%di)
 */

// indexed by latest generated number
let step4Data = new Array(65536);

cnt = 0;
for (let iStep3 = 0; iStep3 < 65536; iStep3++) {
	let step3 = step3Data[iStep3];
	if (step3) {
		let step2 = step3.step2;
		let fix3H = FIXWORD3 >> 8;
		let fix3L = FIXWORD3 & 0xff;

		// next number
		for (let imm = 0; imm < 256; imm++) {
			if (isSafe8[imm]) {

				let si = (step2.hash * imm) & 0xffff;
				let siH = si >> 8;
				let siL = si & 0xff;

				// test if combo is safe
				if (isSafe8[fix3L ^ siL] && isSafe8[fix3H ^ siH]) {

					let score = step3.score + isSafe8[imm];

					// valid combo
					if (!step4Data[si] || score < step4Data[si].score) {
						step4Data[si] = {
							score: score,		// desirability
							SEEDFIX3: imm,		// multiplier
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
				if (isSafe8[fix3L ^ siL] && isSafe8[fix3H ^ siH]) {

					let score = step3.score + isSafe16[imm] + 256; // add word penalty

					// valid combo
					if (!step4Data[si] || score < step4Data[si].score) {
						step4Data[si] = {
							score: score,		// desirability
							SEEDFIX3: imm,		// multiplier
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

		// let HEAD be radix13 because its on the second line
		// if (isSafe16[step1.hash] !== 2)
		// 	continue;

		for (let iStep4 = 0; iStep4 < 65536; iStep4++) {
			let step4 = step4Data[iStep4];
			if (step4) {

				// select only triple word combos
				let score = step1.score + step4.score;
				let numWords = score >> 8;  // high byte contains number or words

				// test if hash is excluded
				if (excludeHash.includes(step1.hash))
					continue;

				if (numWords === numPromote) {
					// found combo
					cnt++;

					// select only the best
					if (!best || score < best.score) {
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
	console.error("Error: Failed to create stage1.");
	process.exit(1);
}
console.error("Collect has " + cnt + " candidates");

/*
 * display best candidate
 */

let step4 = best.step4;
let step3 = step4.step3;
let step2 = step3.step2;
let step1 = best.step1;
let di = step1.di;
let OFSHASH = (STAGE3BASE - INITSI) & 0xffff;
let OFSHEAD = (STAGE3BASE - di) & 0xffff;
let OFSTEXT = (STAGE3BASE + 2 - di) & 0xffff;
let HASHHEAD = step1.hash;

let result = "";

result += "// Generated by \"" + process.argv[1] + "\"\n";
result += "// Stage-1\n";
result += "NUMPROMOTE = " + numPromote + " \t// Number of bytes promoted to word\n";
result += "OFSHASH = " + toChar(OFSHASH) + " \t// %si offset containing stage1 number generator hash, hash=" + toHex(step1.hash) + '\n';
result += "SEEDDI = " + toHex(step1.SEEDDI) + " \t// multiplier for step-1A. %di=" + toHex(di, 2) + '\n';
result += "SEEDSI = " + toHex(step2.SEEDSI) + " \t// multiplier for step-1B. %si=" + toHex(step2.si, 2) + ", hash=" + toHex(step2.hash, 2) + '\n';
result += "SEEDFIX12 = " + toHex(step3.SEEDFIX12) + " \t// multiplier for step-1C. %si=" + toHex(step3.si, 2) + '\n';
result += "SEEDFIX3 = " + toHex(step4.SEEDFIX3) + " \t// multiplier for step-1D. %si=" + toHex(step4.si, 2) + '\n';
result += "OFSFIX1 = " + toChar(FIXADDR1 - di) + " \t// patch offset for step-2B\n";
result += "FIX1H = " + toHex(step3.si >> 8, 1) + " \t// patch for HI-byte\n";
result += "FIX1L = " + toHex(step3.si & 0xff, 1) + " \t// patch for LO-byte\n";
result += "OFSFIX2 = " + toChar(FIXADDR2 - di) + " \t// patch offset for step-2C\n";
result += "FIX2H = " + toHex(step3.si >> 8, 1) + " \t// patch for HI-byte\n";
result += "FIX2L = " + toHex(step3.si & 0xff, 1) + " \t// patch for LO-byte\n";
result += "OFSFIX3 = " + toChar(FIXADDR3 - di) + " \t// patch offset for step-2D\n";
result += "FIX3H = " + toHex(step4.si >> 8, 1) + " \t// patch for HI-byte\n";
result += "FIX3L = " + toHex(step4.si & 0xff, 1) + " \t// patch for LO-byte\n";
result += "// Stage-2A\n";
result += "OFSHEAD = " + toChar(OFSHEAD) + " \t// %di offset to output HEAD containing stage2 number generator hash\n";
result += "HASHHEAD = " + toHex(HASHHEAD, 2) + '\n';
result += "HASHHEADH = " + toChar(HASHHEAD >> 8, 1) + " \t// decoder hash HI-byte\n";
result += "HASHHEADL = " + toChar(HASHHEAD & 0xff, 1) + " \t// decoder hash LO-byte\n";
result += "#if !defined(SEEDHEAD)\n";
result += "SEEDHEAD = " + toHex(SEEDHEAD, 2) + " \t// supplied by genStage2.js\n";
result += "#endif\n";
result += "// Stage-2B\n";
result += "OFSTEXT = " + toChar(OFSTEXT) + " \t// %di offset to input TEXT containing the next character\n";
result += "SEEDTEXT = " + toHex(SEEDTEXT, 1) + " \t// ascii-safe user defined\n";
result += "// Stage-3\n";
result += "STAGE3EOS = " + toHex(STAGE3EOS, 2) + " \t// stage3 end-of-sequence token\n";

// save
try {
	fs.writeFileSync(incFilename, result);
} catch (e) {
	console.error("Error: Failed to save \"" + incFilename + "\", " + e);
	process.exit(1);
}

/*
 * Update config if changed
 */

console.error("#Provides: " + JSON.stringify({
	OFSHASH: toHex(OFSHASH, 1),
	OFSHEAD: toHex(OFSHEAD, 1),
	OFSTEXT: toHex(OFSTEXT, 1),
	HASHHEAD: toHex(HASHHEAD, 2),
	STAGE3OFFSET: STAGE3OFFSET,
}));

if (config) {
	if (
		config.OFSHASH !== OFSHASH ||
		config.OFSHEAD !== OFSHEAD ||
		config.OFSTEXT !== OFSTEXT ||
		config.HASHHEAD !== HASHHEAD ||
		config.STAGE3OFFSET !== STAGE3OFFSET
	) {
		config.OFSHASH = toHex(OFSHASH, 1);
		config.OFSHEAD = toHex(OFSHEAD, 1);
		config.OFSTEXT = toHex(OFSTEXT, 1);
		config.HASHHEAD = toHex(HASHHEAD, 2);
		config.STAGE3OFFSET = STAGE3OFFSET;

		saveConfig(configFilename, config);

		console.error("#Updated configuration file \"" + configFilename + "\"");


	}
}

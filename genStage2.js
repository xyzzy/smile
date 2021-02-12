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
 * This program encodes `stage3.com` into ascii-safe characters for stage2 to decode.
 */

"use strict";

let fs = require("fs");

let STAGE3BASE = 0x0130;	// designed start of stage3. 0x0130-0x0139 is valid range.
let HASHHEAD = 0x316b;		// word hash for output number generator.
let SEEDTEXT = 0x6e;		// byte seed for input number generator.
let STAGE3OFFSET = 0;		// Starting position in template
let maxStep = 6;
let optFirst = false;
let optVerbose = 0;

/*
 * radix10/radix13 character set
 */

let radix10 = new Uint8Array(10);
let radix13 = new Uint8Array(13);

for (let i = 0; i < 10; i++)
	radix10[i] = "0123456789".charCodeAt(i);
for (let i = 0; i < 13; i++)
	radix13[i] = "acemnorsuvwxz".charCodeAt(i);

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
	console.error("usage: <stage3.asc> <stage3.com> <template.txt>");
	console.error("        --config=<filename>    Makefile configuration.");
	console.error("        --STAGE3BASE=<value>   Designed start stage3.  [default=" + toHex(STAGE3BASE, 2) + "]");
	console.error("        --HASHHEAD=<value>     Initial value of hash output number generator. [default=" + toHex(HASHHEAD, 2) + "]");
	console.error("        --SEEDTEXT=<value>     Byte seed for input number generator. [default=" + toHex(SEEDTEXT, 1) + "]");
	console.error("        --STAGE3OFFSET=<value> Starting position in template");
	console.error("        --maxstep=<value>      Maximum number of number generator steps to reach output byte. [default=" + maxStep + "]");
	console.error("        --first                Stop after first found combo");
	process.exit(1);
}

let argv = require('minimist')(process.argv.slice(2), {boolean: ["first"]});
let args = [];
let configFilename;
let config;

for (const opt in argv) {
	if (opt === "_") {
		args = argv[opt];
	} else if (opt === "STAGE3BASE") {
		STAGE3BASE = Number.parseInt(argv[opt]);
	} else if (opt === "HASHHEAD") {
		HASHHEAD = Number.parseInt(argv[opt]);
	} else if (opt === "SEEDTEXT") {
		SEEDTEXT = Number.parseInt(argv[opt]);
	} else if (opt === "STAGE3OFFSET") {
		STAGE3OFFSET = Number.parseInt(argv[opt]);
	} else if (opt === "maxstep") {
		maxStep = Number.parseInt(argv[opt]);
	} else if (opt === "first") {
		optFirst = argv[opt];
	} else if (opt === "config") {
		configFilename = argv[opt];
		// load config
		config = loadConfig(configFilename);
		// values of interest
		if (config.STAGE3BASE)
			STAGE3BASE = config.STAGE3BASE;
		if (config.HASHHEAD)
			HASHHEAD = config.HASHHEAD;
		if (config.SEEDTEXT)
			SEEDTEXT = config.SEEDTEXT;
		if (config.STAGE3OFFSET)
			STAGE3OFFSET = config.STAGE3OFFSET;
	} else if (opt === "h" || opt === "help") {
		usage();
	} else {
		usage();
	}
}
if (args.length < 3)
	usage();

console.log("#Using: " + JSON.stringify({
	STAGE3BASE: toHex(STAGE3BASE, 2),
	HASHHEAD: toHex(HASHHEAD, 2),
	SEEDTEXT: toHex(SEEDTEXT, 1),
	STAGE3OFFSET: STAGE3OFFSET,
}));

let ascFilename = args[0];
let comFilename = args[1];
let templateFilename = args[2];

/*
 * Load input files
 */

let data;
try {
	data = new Uint8Array(fs.readFileSync(comFilename));
} catch (e) {
	console.error("Failed to load input. " + e.toString());
	process.exit(1);
}

let template;
try {
	template = new Uint8Array(fs.readFileSync(templateFilename));
} catch (e) {
	console.error("Failed to load input. " + e.toString());
	process.exit(1);
}

/**
 * @typedef {Object} Node
 * @property {number}     hash  - Hash at start of step
 * @property {Uint8Array} text  - Generate text
 */

/**
 * Generate encoded text and return shortest possibility
 *
 * @param {number} seed    - seed for number generator
 * @param {Node}   cache[] - starting position and state storage
 */
function generate(seed, cache) {
	let iPos = 0;
	do {
		// get current state
		let obj = cache[iPos];
		if (obj) {
			// release from cache
			cache[iPos] = null;

			/*
			 * what type is next character
			 */
			let radix;
			let tofs = STAGE3OFFSET + obj.text.length; // offset in template
			if (tofs >= template.length || template[tofs] === 0x2e)
				radix = radix13; // DOT
			else if (template[tofs] === 0x2a)
				radix = radix10; // STAR
			else
				radix = [template[tofs]]; // literal

			/*
			 * Simulate decoder main loop
			 */
			for (let iRadix = 0; iRadix < radix.length; iRadix++) {
				// get current value and treat as next input character
				const val = radix[iRadix];

				// determine new number and update hash
				const si = (seed * obj.hash) & 0xffff;
				let hash = obj.hash ^ si;

				// time to live
				let step = obj.step + 1;

				// test if character complete
				let codeLength = obj.codeLength;
				if ((hash & 0x8000) !== 0) {
					// byte ready
					if (codeLength === data.length) {
						// underflow
						continue;
					} else if ((hash & 0xff) !== data[codeLength]) {
						// false ByteReady
						continue;
					} else {
						// increment head 1 position.
						// This shifts the low byte out, and shifts a new byte in
						hash >>= 8;
						// populate high byte with previous output
						hash |= obj.text[codeLength] << 8;

						// update position
						codeLength++;
						// refresh timer
						step = 0;
					}
				}

				// test if cycling through number generator takes to long
				if (step > maxStep)
					continue;

				// load input text as word. This includes the actual text byte and the byte preceding because that is defined.
				let bp = val << 8; // text letter goes in upper byte
				if (obj.text.length === 0)
					bp |= hash >> 8; // no previous output, use hi-byte of hash which is located there
				else
					bp |= obj.text[obj.text.length - 1]; // load previous text byte into lower byte

				// number generator
				bp = (bp * SEEDTEXT) & 0xffff;
				// update hash
				hash ^= bp;

				// test end condition
				if (hash === 0x0000) {
					// terminator
					if (codeLength !== data.length) {
						// not yet
						continue;
					} else {
						// end situation, append closing character
						let result = Array.from(obj.text);
						result.push(val);
						// return found encoded string
						return result;
					}
				}

				// construct index based on starting position next step
				let ix = ((obj.text.length + 1) << 16) | hash;

				// add to cache
				if (!cache[ix] || codeLength > cache[ix].codeLength) {
					// create a new code string
					let text = new Uint8Array(obj.text.length + 1);
					// copy old contents
					text.set(obj.text);
					// append net value
					text[text.length - 1] = val;

					// create new object
					cache[ix] = {
						hash: hash,
						codeLength: codeLength,
						step: step,
						text: text,

						// for debugging

						// val: toHex(val, 1),
						// seed: toHex(seed, 2),
						// oldHash: toHex(obj.hash, 2),
						// si: toHex(si, 2),
						// ix: ix,
						// prev: obj,
					};
				}
			}
		}

	} while (iPos++ < cache.length);

	// no solution found
	return null;
}

/**
 * Validate an encoded stream
 *
 * @param {number} seed    - seed for number generator
 * @param {number} hash    - initial hash
 * @param {number} text[]  - Encoded text as ascii values
 */
function validate(seed, hash, text) {

	/*
	 * construct target memory
	 */

	let mem = [];
	// append hash
	mem.push(hash & 0xff, hash >> 8);
	// append encoded text
	for (let k in text)
		mem.push(text[k]);

	/*
	 * decode
	 */

	let si = 0, di = 0, bx = 0, bp = 0;
	let OFSHEAD = 0;
	let OFSTEXT = 2;

	while (di < mem.length) {
		/*
		 * emulate stage2
		 */

		if (optVerbose) {
			console.log("bx=" + toHex(bx & 0xffff, 2) + " si=" + toHex(si, 2) + " bp=" + toHex(bp, 2) +
				toHex(OFSHEAD + bx + di + 0 + STAGE3BASE, 2) + ": " + toHex(mem[OFSHEAD + bx + di + 0] + mem[OFSHEAD + bx + di + 1] * 256, 2) +
				toHex(OFSTEXT - 1 + di + 0 + STAGE3BASE, 2) + ": " + toHex(mem[OFSTEXT - 1 + di + 0] + mem[OFSTEXT - 1 + di + 1] * 256, 2));
		}

		// stage2Start:
		// 011a: 69 71 X X X	imul	$SEED,OFSHEAD(%bx,%di),%si	//* update hash
		si = (seed * (mem[OFSHEAD + bx + di + 0] + mem[OFSHEAD + bx + di + 1] * 256)) & 0xffff;

		// 011f: 31 71 X	xorw	%si,OFSHEAD(%bx,%di)		//* number generator
		mem[OFSHEAD + bx + di + 0] ^= si & 0xff;
		mem[OFSHEAD + bx + di + 1] ^= si >> 8;

		// 0122: 79 01		jns	L2				//* jump is sign bit clear
		if (mem[OFSHEAD + bx + di + 1] & 0x80) {
			// 0124: 43		inc	%bx			//* shift output position
			bx++;
		}
		// L2:
		// 0125: 6b 6d X X	imul	$SEEDTEXT,OFSTEXT-1(%di),%bp	//* use input text as word to generate next number
		bp = (SEEDTEXT * (mem[OFSTEXT - 1 + di + 0] + mem[OFSTEXT - 1 + di + 1] * 256)) & 0xffff;

		// 0129: 47		inc	%di				//* shift input position
		di++;

		// 012a: 4b		dec	%bx				//* increment distance input/output, decrement because %bx is used negatively
		bx--;

		// 012b: 31 69 X	xorw	%bp,OFSHEAD(%bx,%di)		//* Inject entropy into HEAD
		mem[OFSHEAD + bx + di + 0] ^= bp & 0xff;
		mem[OFSHEAD + bx + di + 1] ^= bp >> 8;


		// 012e: 75 ea		jne	stage2Start			//* repeat until end-of-sequence
		if (mem[OFSHEAD + bx + di + 0] === 0x00 && mem[OFSHEAD + bx + di + 1] === 0x00)
			break;
	}
	let memSize = di + bx;

	// compare memory
	let match = 1;
	for (let i = 0; i < memSize; i++)
		if (data[i] !== mem[i])
			match = 0;

	if (!match || memSize !== data.length) {
		console.log("Verify failed", JSON.stringify({
			encodeLength: data.length,
			decodeLength: memSize,
			match: match,
			encode: Array.from(data),
			decode: mem
		}, "\n"));
		process.exit(1);
	}
}

/*
 * The state cache is indexed by output length and hash.
 * In case of collision, then the shorter input length is preferred.
 */

let best = null;
for (let hi = 0; hi < radix13.length; hi++) {
	for (let lo = 0; lo < radix13.length; lo++) {
		let seed = radix13[hi] * 256 + radix13[lo];

		// test if one candidate is sufficient
		if (best && optFirst)
			continue;

		// create a new cache containing the starting position
		let cache = [];
		cache.push({
			hash: HASHHEAD,
			step: 0,
			codeLength: 0,
			text: "",
		});

		// find encoding for seed
		let result = generate(seed, cache);

		if (result) {
			// validate result
			validate(seed, HASHHEAD, result);

			// convert to string
			let strResult = String.fromCharCode.apply(null, result);

			// construct display text
			let dispText = strResult.replace(/\s/g,'_');

			if (!best || strResult.length < best.length) {
				console.log(toHex(seed, 2), dispText, result.length, "[BEST]");
				best = {
					seed: seed,
					strResult: strResult,
				};

			} else {
				console.log(toHex(seed, 2), dispText, result.length);
			}
		}
	}

}

if (!best) {
	console.error("Error: Failed to create stage2. Add HASHHEAD (" + toHex(HASHHEAD, 2) + ") to `excludeHash` in genStage1.js");
	process.exit(1);
}

/*
 * Save
 */

try {
	fs.writeFileSync(ascFilename, best.strResult);
} catch (e) {
	console.error("Error: Failed to save \"" + ascFilename + "\", " + e);
	process.exit(1);
}

/*
 * Update config if changed
 */

let SEEDHEAD = best.seed;
let STAGE4BASE = STAGE3BASE + data.length;
let STAGE4OFFSET = STAGE3OFFSET + best.strResult.length;

console.error("#Provides: " + JSON.stringify({
	SEEDHEAD: toHex(SEEDHEAD, 2),
	STAGE4BASE: toHex(STAGE4BASE, 2),
	STAGE4OFFSET: STAGE4OFFSET,
}));

if (config) {
	if (
		config.SEEDHEAD !== SEEDHEAD ||
		config.STAGE4BASE !== STAGE4BASE ||
		config.STAGE4OFFSET !== STAGE4OFFSET
	) {
		config.SEEDHEAD = toHex(SEEDHEAD, 2);
		config.STAGE4BASE = toHex(STAGE4BASE, 2);
		config.STAGE4OFFSET = STAGE4OFFSET;

		saveConfig(configFilename, config);

		console.error("#Updated configuration file \"" + configFilename + "\"");
	}
}

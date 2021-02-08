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

"use strict";

let fs = require("fs");

/*
 * Load command line
 */

function usage() {
	console.error("usage: <stage2.asc> <stage2.com> <template.txt>");
	process.exit(1);
}

let argv = require('minimist')(process.argv.slice(2));
let args = [];

for (const name in argv) {
	if (name === "_") {
		args = argv[name];
	} else if (name === "h" || name === "help") {
		usage();
	} else {
		usage();
	}
}
if (args.count < 3)
	usage();

let ascFilename = args[0];
let comFilename = args[1];
let templateFilename = args[2];

/*
 * Read data
 */

let data;
try {
	data = new Uint8Array(fs.readFileSync(comFilename));
} catch (e) {
	console.error("failed to load input. " + e.toString());
	process.exit(1);
}

let initialSEED = 0x3030;
let initialHash = 0x316b;
let maxStepLength = 6;

/*
 * Global state and Helpers
 */

let radix10 = new Uint8Array(10);
let radix13 = new Uint8Array(13);

for (let i = 0; i < 10; i++)
	radix10[i] = "0123456789".charCodeAt(i);
for (let i = 0; i < 13; i++)
	radix13[i] = "acemnorsuvwxz".charCodeAt(i);

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

/**
 * @typedef {Object} Node
 * @property {number}     hash  - Hash at start of step
 * @property {number}     ah    - Input entropy
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
			if (0)
				radix = radix10;
			else
				radix = radix13;

			/*
			 * Simulate decoder main loop
			 */
			for (let iRadix = 0; iRadix < radix.length; iRadix++) {
				// get current value and treat as next input character
				const val = radix[iRadix];

				// determine new number and update hash
				const si = (seed * obj.hash) & 0xffff;
				let hash = obj.hash ^ obj.ah ^ si;

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
				if (step > maxStepLength)
					continue;

				/*
				 * update entropy source
				 *
				 * NOTE: subtracting 0x30:
				 *       - allows for stage1 to detect and skip spaces
				 *       - reduces encoded output from ~280 bytes to ~170
				 *       - increases stage1 by about ~10 bytes
				 */
				let ah = obj.ah ^ (val - 0x30);
				if (ah === 0) {
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

				/*
				 * load next character
				 * NOTE: %ah is not the actual character but the XOR or all previous characters.
				 * NOTE: an %ah of zero flags end-of-sequence
				 */
				// let ah = obj.ah ^ val;

				/* construct index based on starting position next step
				 *
				 * The instruction reordering of stage2 causes %ah to be updated last.
				 * This has the effect that the input character is delayed one step.
				 * The cache used the character to track alternative paths.
				 * For that reason, derive the index from the current character, not the previous.
				 */
				let ix = ((obj.text.length + 1) << 16) | (hash ^ val);

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
						val: toHex(val, 1),
						ohash: toHex(obj.hash, 2),
						si: toHex(si, 2),
						seed: toHex(seed, 2),

						ix: ix,
						hash: hash,
						ah: ah,

						step: step,

						codeLength: codeLength,
						text: text,
						oldix: obj,
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

	let codePos = 0;
	let textPos = 2;
	let ah = 0;

	while (textPos < mem.length) {

		let si = (seed * (mem[codePos] + mem[codePos + 1] * 256)) & 0xffff;

		mem[codePos] ^= ah;
		mem[codePos] ^= si & 0xff;
		mem[codePos + 1] ^= si >> 8;

		if (mem[codePos + 1] & 0x80) {
			codePos++;
			// mem[codePos] = si & 0xff;
			// mem[codePos + 1] = si >> 8;
		}

		ah ^= (mem[textPos] - 0x30);
		textPos++;
	}

	// compame memory
	let match = 1;
	for (let i=0; i<codePos; i++)
		if (data[i] !== mem[i])
			match = 0;

	if (!match || ah !== 0 || codePos !== data.length) {
		console.log("Verify failed", JSON.stringify({
			ah: ah,
			encodeLength: data.length,
			decodeLength: codePos,
			match: match,
			encode: Array.from(data),
			decode: mem
		}, "\n"));
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

		// create a new cache containing the starting position
		let cache = [];
		cache.push({
			hash: initialHash,
			ah: 0,
			step: 0,
			codeLength: 0,
			text: "",
		});

		// find encoding for seed
		let result = generate(seed, cache);

		if (result) {
			// validate result
			validate(seed, initialHash, result);

			// convert to string
			let strResult = String.fromCharCode.apply(null, result);

			if (!best || strResult.length < best.length) {
				console.log(toHex(seed, 2), strResult, result.length, "[BEST]");
				best = result;
			} else {
				console.log(toHex(seed, 2), strResult, result.length);
			}
		}
	}

}
// 0x7672 170
// {"val":"0x72","ohash":"0xaa28","si":"0x35d0","seed":"0x7672","ix":11154850,"hash":13776,"ah":119,"step":0,"codeLength":56,"text":{"0":101,"1":99,"2":97,"3":119,"4":122,"5":114,"6":111,"7":109,"8":114,"9":99,"10":101,"11":117,"12":120,"13":97,"14":114,"15":119,"16":101,"17":109,"18":122,"19":115,"20":122,"21":111,"22":115,"23":120,"24":99,"25":101,"26":114,"27":101,"28":97,"29":111,"30":118,"31":114,"32":99,"33":99,"34":114,"35":101,"36":101,"37":109,"38":97,"39":114,"40":97,"41":101,"42":118,"43":122,"44":110,"45":114,"46":122,"47":122,"48":109,"49":114,"50":97,"51":101,"52":118,"53":109,"54":109,"55":119,"56":110,"57":101,"58":115,"59":109,"60":101,"61":99,"62":110,"63":117,"64":109,"65":122,"66":110,"67":111,"68":99,"69":101,"70":110,"71":99,"72":114,"73":120,"74":111,"75":99,"76":99,"77":97,"78":101,"79":122,"80":118,"81":122,"82":118,"83":120,"84":114,"85":119,"86":99,"87":110,"88":97,"89":120,"90":101,"91":101,"92":111,"93":117,"94":109,"95":99,"96":122,"97":118,"98":110,"99":114,"100":101,"101":114,"102":120,"103":101,"104":111,"105":110,"106":120,"107":114,"108":119,"109":109,"110":117,"111":114,"112":114,"113":99,"114":114,"115":109,"116":99,"117":110,"118":111,"119":114,"120":99,"121":120,"122":109,"123":115,"124":114,"125":122,"126":111,"127":119,"128":122,"129":118,"130":118,"131":101,"132":111,"133":117,"134":101,"135":119,"136":117,"137":101,"138":122,"139":118,"140":97,"141":97,"142":111,"143":118,"144":117,"145":115,"146":117,"147":117,"148":119,"149":117,"150":114,"151":109,"152":97,"153":101,"154":97,"155":114,"156":117,"157":115,"158":110,"159":114,"160":109,"161":118,"162":109,"163":115,"164":122,"165":101,"166":117,"167":115,"168":114,"169":114}}

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
 * This program encodes `stage4.com` into mixed ragix10/radix13 characters for stage3 to decode.
 *
 * It basically works like a string->number->string converter
 *
 * string2number:
 *   // read string from left-to-right
 *   // when `num` overflows, a byte is extracted
 *   while(*p)
 *      num = num * base + decodeRadix(*p);
 *
 * number2string:
 *   // write string from right-to-left
 *   // when `num` underflows, a byte in injected
 *   do {
 *     *p++ = encodeRadix(num % base);
 *     num /= base;
 *   } while (num);
 *
 */

"use strict";

let fs = require("fs");

let STAGE4BASE = 0x0130;	// designed start of stage4.
let STAGE4OFFSET = 0;		// Starting position in template
let STAGE3EOS;			// End-of-sequence marker.

/*
 * radix10/radix13 character set
 */

let radix10 = new Uint8Array(10);
let radix13 = new Uint8Array(13);

for (let i = 0; i < 10; i++)
	radix10[i] = "0123456789".charCodeAt(i);
for (let i = 0; i < 13; i++)
	radix13[i] = "nacevxzmorsuw".charCodeAt(i); // radix13 encoder enumeration

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
	console.error("usage: <stage4.asc> <stage4.com> <template.txt>");
	console.error("        --config=<filename>    Makefile configuration.");
	console.error("        --STAGE4BASE=<value>   Designed start stage4.  [default=" + toHex(STAGE4BASE, 2) + "]");
	console.error("        --STAGE4OFFSET=<value> Starting position in template");
	process.exit(1);
}

let argv = require('minimist')(process.argv.slice(2), {});
let args = [];
let configFilename;
let config;

for (const opt in argv) {
	if (opt === "_") {
		args = argv[opt];
	} else if (opt === "STAGE4BASE") {
		STAGE4BASE = Number.parseInt(argv[opt]);
	} else if (opt === "STAGE4OFFSET") {
		STAGE4OFFSET = Number.parseInt(argv[opt]);
	} else if (opt === "config") {
		configFilename = argv[opt];
		// load config
		config = loadConfig(configFilename);
		// values of interest
		if (config.STAGE4BASE)
			STAGE4BASE = config.STAGE4BASE;
		if (config.STAGE4OFFSET)
			STAGE4OFFSET = config.STAGE4OFFSET;
	} else if (opt === "h" || opt === "help") {
		usage();
	} else {
		usage();
	}
}

if (args.length < 3)
	usage();

console.log("#Using: " + JSON.stringify({
	STAGE4BASE: toHex(STAGE4BASE, 2),
	STAGE4OFFSET: STAGE4OFFSET,
}));

let ascFilename = args[0];
let comFilename = args[1];
let templateFilename = args[2];

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

let template;
try {
	template = new Uint8Array(fs.readFileSync(templateFilename));
} catch (e) {
	console.error("Failed to load input. " + e.toString());
	process.exit(1);
}

/*
 * Encode number
 */

/**
 * Generate encoded text and return shortest possibility
 *
 * @param {number} eos        - end-of-sequence token
 * @param {number} tpos       - Starting position in template
 * @param {number} tinc       - Template increment
 * @param {number} minLength  - Add leading zeros until length matches
 */
function generate(eos, tpos, tinc, minLength) {

	let text = [];
	let pool = eos;

	// right-to-left
	for (let pos = data.length - 1; pos >= 0; pos--) {

		// extract characters until pool is in underflow
		for (; ;) {
			if (tpos < 0 || tpos >= template.length || template[tpos] === 0x2e) {
				// radix13
				if (pool < 13)
					break; // underflow

				// extract character
				text.push(radix13[pool % 13]);
				pool = Math.floor(pool / 13);
			} else if (template[tpos] === 0x2a) {
				// radix10
				if (pool < 10)
					break; // underflow

				// extract character
				text.push(radix10[pool % 10]);
				pool = Math.floor(pool / 10);
			} else {
				// take literally
				text.push(template[tpos]);
			}
			// advance template
			tpos += tinc;
		}

		// fill pool
		pool = pool * 256 + data[pos];
	}

	// append pool remainder
	while (pool > 0) {
		if (tpos < 0 || tpos >= template.length || template[tpos] === 0x2e) {
			// extract radix13 character
			text.push(radix13[pool % 13]);
			pool = Math.floor(pool / 13);
		} else if (template[tpos] === 0x2a) {
			// extract radix10 character
			text.push(radix10[pool % 10]);
			pool = Math.floor(pool / 10);
		} else {
			// take literally
			text.push(template[tpos]);
		}
	}

	// add leading zeros
	while (text.length < minLength) {
		if (tpos < 0 || tpos >= template.length || template[tpos] === 0x2e) {
			// extract radix13 character
			text.push(radix13[0]);
		} else if (template[tpos] === 0x2a) {
			// extract radix10 character
			text.push(radix10[0]);
		} else {
			// take literally
			text.push(template[tpos]);
		}
	}

	// reverse order array
	text.reverse();

	return text;
}

/**
 * Validate an encoded stream
 *
 * @param {number} eos    - end-of-sequence token
 * @param {number} text[] - Encoded text as ascii values
 */
function validate(eos, text) {

	let pool = 0;
	let mem = [];
	let foundEOS = false;

	for (let ipos = 0; ipos < text.length; ipos++) {

		// get character
		let ch = text[ipos];

		// decode
		if (ch >= 0x61) {
			// lowercase, radix13
			pool *= 13;

			// zero base
			ch -= 0x61;

			// test odd/even
			if ((ch & 1) === 0 || ch === 17) {
				// "even" row or 'r'
				ch >>= 1;
				// shift 1 to the right
				ch += 1;
			} else {
				// "odd" row
				ch >>= 1;
				// shift 6 to the left
				ch -= 6;
			}
		} else if (ch >= 0x30) {
			// digit, radix10
			pool *= 10;

			ch -= 0x30;
		} else {
			// spacing
			continue;
		}

		// inject value into pool
		pool += ch;

		// test end-of-sequence marker
		if (pool === eos) {
			foundEOS = true;
			break;
		}

		// extract byte when ready
		if (pool & 0xff00) {
			mem.push(pool & 0xff);
			pool >>= 8;
		}
	}

	// compare memory
	let match = (mem.length >= data.length);
	for (let i = 0; i < data.length; i++)
		if (data[i] !== mem[i])
			match = 0;

	if (!foundEOS || !match) {
		if (1)
			console.error("Verify failed. STAGE3EOS=" + toHex(eos) + ", byte " + mem.length + " of " + data.length);
		else
			console.error("Verify failed", JSON.stringify({
				foundEOS: foundEOS.toString(),
				encodeLength: data.length,
				decodeLength: mem.length,
				match: match,
				encode: Array.from(data),
				decode: mem
			}, "\n"));
		return false;
	}

	return true;
}

/*
 * encode with valid end-of-sequence token
 */


/*
 * Generate output
 * Because of the right-to-left nature of the encoded number, the template needs to be read from back to front.
 * The issue is, that because of the mixed radix10/radix13 it is not sure how long the encoded text will be.
 * Counting that length from the back might end at a different starting offset than requested.
 *
 * First, try to add a bit of offset jitter, things migh just fall into place.
 * Second, add trailing padding and try again
 *
 *
 */

let OLDEOS = 0;
if (config && config.STAGE3EOS && config.STAGE3EOS !== 0) {
	OLDEOS = config.STAGE3EOS;
	console.error("#Reusing STAGE3EOS=" + toHex(OLDEOS));
}

// get safe estimation of template end position
let endPos = STAGE4OFFSET + generate(0x0100, STAGE4OFFSET, +1).length - 5;
let strResult = null;

// scan the area
for (let iScan = 0; iScan < 40; iScan++) {
	for (let eos = 0x0100; eos < 0x00ff * 10; eos++) {
		if (OLDEOS && eos !== OLDEOS)
			continue; // not selected for re-use

		let text = generate(eos, endPos + iScan - 1, -1, endPos + iScan - STAGE4OFFSET);

		// test if found
		if (STAGE4OFFSET + text.length === endPos + iScan) {
			if (validate(eos, text)) {
				strResult = String.fromCharCode.apply(null, text);
				STAGE3EOS = eos;

				// console.error("Found with: " + JSON.stringify({
				// 	eos: toHex(eos, 2),
				// 	text: strResult.replace(/\s/g, '_'),
				// }));

				// break loops
				iScan = 100;
				break;
			}
		}
	}
}

if (!strResult) {
	console.error("Error: Failed to create stage3.");
	process.exit(1);
}

/*
 * Save
 */

try {
	fs.writeFileSync(ascFilename, strResult);
} catch (e) {
	console.error("Error: Failed to save \"" + ascFilename + "\", " + e);
	process.exit(1);
}

/*
 * Update config if changed
 */

console.error("#Provides: " + JSON.stringify({
	STAGE3EOS: toHex(STAGE3EOS, 2),
}));

if (config) {
	if (
		config.STAGE3EOS !== STAGE3EOS
	) {
		config.STAGE3EOS = toHex(STAGE3EOS, 2);

		saveConfig(configFilename, config);

		console.error("#Updated configuration file \"" + configFilename + "\"");
	}
}

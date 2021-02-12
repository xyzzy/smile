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

// display template, excluding stage12
let STAGE3OFFSET = 49;

/*
 * This code converts a png into text
 */

"use strict";

const {createCanvas, loadImage} = require('canvas');

loadImage(process.argv[2]).catch(e => {
	console.log("failed to load image");
}).then((image) => {

	// create canvas
	const canvas = createCanvas(image.width, image.height);
	const ctx = canvas.getContext('2d');

	ctx.strokeStyle = "#00000000"; // transparent
	ctx.fillStyle = "#00000000";
	ctx.fillRect(0, 0, image.width, image.height);

	// draw image on canvas
	ctx.drawImage(image, 0, 0, image.width, image.height);

	// console.log(image.width, image.height);
	// process.exit();

	// get pixel data
	const rgba = new Uint32Array(ctx.getImageData(0, 0, image.width, image.height).data.buffer);

	let template = "";
	for (let row = 0; row < image.height; row++) {
		for (let col = 0; col < image.width; col++) {

			if (rgba[row * image.width + col] & 0xff)
				template += '*';
			else
				template += '.';
		}
		// DOS newline
		template += '\r\n';
	}

	console.log(template);
});

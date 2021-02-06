# Welcome to the Wonderful World of ASCII binaries

*The marvelous wonders of self modifying code*

"Smile" is an executable ASCII and consists exclusively of digits and lowercase letters.

  - Viewed as text, it shows ascii art consisting of digits and the ascender free lowercase letter "acemnorsuvwxz".  
    The difference in contrast between the height of letters and digits should highlight the embedded artwork.

  - Running as a MS-DOS/FreeDOS binary, it displays a kaleidoscope.

Reducing the instruction set by removing all opcodes that are not alphanumerical, strips it basically down to only three instructions.  
Those three instructions are by an astronomical improbability capable to jailbreak those restrictions.

The code and analysis might look straight forward but bear in mind that more than 800 tries and attempts were made to find the magic combination of instructions.

`TL;DR` The juicy technical bit is about the mother of all instructions (stage1), and the radix13 encoding using ascii art (stage2).

"Smile" is re-mastered from the original 2011 version.

### Challenges/restrictions

*Mastery is revealed in limitation \[Goethe\]*

Computer code consists of bytes where most of the common used values are not displayable as text.  
For "smile" only 10+26 of those bytes are usable reducing the usability of a byte down to 15%.  
The ASCII art that avoids an additional 13 letters reduces that further down to 9%.

From a coding perspective this enforces the restrictions:

  - Half the registers are available and severely restricted in usage
  - All common used constants and offsets are unavailable
  - In all practicality, only the `xor` and `imul` instructions are available
  - At program start, only the values `0x20cd`, `0x0100`, `0xfffe` are available

The chances that what is left can produce an executable is so astronomically small that the only explanation would be
 that the opcodes of the x86 instruction-set were deliberately constructed with ascii-safe binaries in mind.

### Bonuses

"Smile" does take advantage of a DOS environment:

  - DOS `.com` programs do not require a binary header.
    The contents of a `.com` are loaded verbatim at address `0x0100` and run unconditionally.

  - Self-modifying code.  
    DOS does not enforce memory protection allowing the mixing of code and data.

## Usage

Within a DOS environment and command prompt:

  - View as text:

	TYPE smile.com

  - Run as executable:

	smile

## Instruction set analysis

The file [instructions.txt](instructions.txt) contains an overview of all usable ascii-safe instructions.

In essence only the registers `%si`, `%di`, `%bp`, `%bx`, `%ah` are available, and the instruction classes:

```assembler
	xor	reg,OFS(reg,reg)
	xor	OFS(reg,reg),reg
	cmp	reg,OFS(reg,reg)
	imul	$IMM,(reg,reg),reg
	jXX	OFS
```

Each instruction class has a limited combination of registers and offsets.  
Offsets and immediate values need to be ascii-safe.  
Some instructions allow the omission of a register offset.


The `imul` instruction writes to a register, and the `xor` does a read-modify-write to either a register or memory.

Both `imul` and `xor` are also the critical minimal to write a hash/number generator and self-modifying code.  
Without these two classes of instructions this project would not have been possible.

### Registers
There are four and a half registers available:

- Two 16bit index registers (ireg) `%si` and `%di`
- Two 16bit base registers (breg) `%bp` and `%bx`
- One 8bit register `%ah`

### Instructions that write/modify `%si`

Initial value of `%si` is `0x0100`

`%si` is highly versatile.  
`%si` is volatile because it is the only register that can be used for the number generator  

```assembly
	xor	(breg,ireg),%si
	xor	(%si),%si
	xor	(%di),%si
	xor	(%bx),%si
	xor	OFS(breg,ireg),%si
	xor	OFS(reg),%si
	imul	$IMM,(breg,ireg),%si
	imul	$IMM,(%si),%si
	imul	$IMM,(%di),%si
	imul	$IMM,(%bx),%si
	imul	$IMM,OFS(breg,ireg),%si
	imul	$IMM,OFS(reg),%si
	imul	$IMM,(breg,ireg),%si
	imul	$IMM,(%si),%si
	imul	$IMM,(%di),%si
	imul	$IMM,(%bx),%si
	imul	$IMM,OFS(breg,ireg),%si
	imul	$IMM,OFS(reg),%si
```

### Instructions that write/modify `%di`

Initial value of `%di` is `0xfffe`

`%si` is needed to modify `%di`.

```assembly
	xor	(%bx,ireg),%di
	xor	OFS(%bx,ireg),%di
	xor	OFS(%bp,%si),%di
	imul	$IMM,(%bx,ireg),%di
	imul	$IMM,OFS(%bx,%ireg),%di
	imul	$IMM,OFS(%bp,%si),%di
```

### Instructions that write/modify `%bp`

Initial value of `%bp` is undefined.

Only way to write to `%bp` is by using `imul`.
The `imul` requires an ascii-safe register offset, requiring a preloaded anchor register.

```assembly
	xor	OFS(breg,ireg),%bp      
	xor	OFS(reg),%bp	  
	imul	$IMM,OFS(breg,ireg),%bp 
	imul	$IMM,OFS(reg),%bp     
	imul	$IMM,OFS(breg,ireg),%bp 
	imul	$IMM,OFS(reg),%bp     
```

### Instructions that modify `%bx`

Initial value of `%bx` is 0x0000.

Only the high byte can be modified.  
`%bx` only use is for the number generator described below.

```assembly
	xor	(%bx,ireg),%bh
	xor	OFS(%bx,ireg),%bh
	xor	OFS(%bp,%si),%bh
```

### Instructions that can be used before an anchor register is loaded

The anchor register can be used with ascii-safe offsets to patch stage2.  
Excluding instructions that use the undefined `%bh` and `%bp`

```assembly
	xor	%si,(%bx,ireg)
	xor	%si,(%si)
	xor	%si,(%di)
	xor	%si,(%bx)
	xor	%di,(%bx,ireg)
	
	xor	(%bx,ireg),%si
	xor	(%si),%si
	xor	(%di),%si
	xor	(%bx),%si
	xor	(%bx,ireg),%di
	
	imul	$IMM,(%bx,ireg),%si
	imul	$IMM,(%si),%si
	imul	$IMM,(%di),%si
	imul	$IMM,(%bx),%si
	imul	$IMM,(%bx,ireg),%di
```

## Implementation

"Smile" is a three-stage loader/executable.  
The multi-stage design is to escape the limitations of a more than critical reduced instruction-set.

  - Stage-3: The actual program.  
    It is encoded as ascii-safe string and unpacked by stage 2

  - Stage-2: The unpacker.  
    Optimised loader thats converts the radix13 encoded ascii art converter to
    The ascii-safe instruction-set is incomplete to do anything really useful.  
    Unsafe bytes are made safe replacing them with a placeholder value that need to patched before the code can be executed.

  - Stage-1: The patcher.  
    A gem of improbability jumping through hoops to patch/self-modify stage-2 into something runnable.

In effect, stage1 prepares the input and output pointers, stage2 unpacks the most efficient decoder and stage3 is the demo.

### Stage 1

The function of stage-1 is to patch some code bytes of stage-2.

The simplest way to patch stage-2 is `XOR`ing the ascii-safe placeholders with a precalculated value that changes it into the required opcode.  
Something like `xor $IMM,ADDR`, but that instruction is unavailable.  
Not only that, the concept of using constants for `IMM` and `ADDR` is also unavailable.
The only way to access memory is by using register indirect with optional offset: `OFS(reg)`.  
For multiple patches, loading the register with individual addresses is expensive.  
We would want to have some central reference and use `OFS` to actual patch locations

`OFS`, when used, needs to be ascii-safe and with a large enough range to span stage2.  
`reg` needs to be loaded with the address of the reference point.

To ease on readability, offsets have been chosen to be ascii-lowercase values.  
In case of emergency, there is a second range having ascii-digit values

Until the reference register has been loaded, offsets are unavailable reducing the available instructions:

```assembler
	// `ireg` is either %si or %di
	// `reg` is either %si, %di or %bx
        
	xor	%si,(reg)
	xor	ireg,(%bx,ireg)
	xor	(reg),%si
	xor	(%bx,ireg),ireg
       
	imul	$IMM,(reg),%si
	imul	$IMM,(%bx,ireg),ireg
```

`reg`, can be one of `%si`, `%di`, `%bx`.  
  `%bx` is in-use and unavailable  
  `%si` holds the generated number and unavailable.  
  `%di` free and only candidate for reference register.

#### Program start

The above base instructions all use input values from either memory or registers.  
They do not provide fixed values, they read and modify values.  
Using them only makes sense when the input values are defined.

DOS initializes the following environment with fixed values:

```
	%si = 0x0100  
	%di = 0xfffe  
	%bx = 0x0000  
	(%bx) = 0x20cd 
```

Applying these as constraints to the set of base instructions above, reduces it further to:

```assembler
	xor	%si,(%bx)
	xor	(%bx),%si
	imul	$IMM,(%bx),%si
```

These are the only three instructions available until `%si` or `%di` contains a reference location.

#### Number generator

Having `imul` and `xor` are perfect ingredients for a hash-function/number-generator.

The `imul` creates a new value based on a stored hash and given seed, and writes that to `%si`.  
A second step for continuation used the `xor` to update the hash value.

```assembler
	imul    $SOMESEED,(%bx),%si	// next number in register
        xor	%si,(%bx)		// next number in memory
```

The idea is to craft a sequence of specific seed/multipliers that create the necessary values to patch stage 2.

```assembler
	// generate number
	imul	$SOMESEED,(%bx),%si
	xor	%si,(%bx)

	// with %si as temporary reference register, load %di
	imul	$SOMESEED,OFS(%bx,%si),%di

	REPEAT {
		// generate number
		imul	$SOMESEED,(%bx),%si
		xor	%si,(%bx)

		// patch memory
		xor	%si,OFS(%di)
	}
```

#### Re-mastering bonus

After writing the above section and re-mastering the sources:

New insights made it possible to reduce the size of stage1 to under 48 bytes.  
This makes extra instruction available that allow the loading of %di as first step.  
Effectively halving the size of stage1.

### Stage 2

With the added functionality of reading/writing a stream of data.
The input stream is limited range text and influences the number generator
The output stream are binary snapshots of the number generator.  
The encoder creates text that requires the least number of generator cycles.

Task is to load stage 3, an arithmetic based radix13 character encoding.  
Stage 3 will load the actual demo.  
For really large demos, there is also an additional zip-based loader.

In the text/input-data there are also encoded two commands:

- Increment position of the output head, which contains the number generator hash.
  Setting the highest bit in the hash value, it should be clear otherwise.

- End of sequence.
  Setting the upper byte of the hash to zero, it should be non-zero otherwise.

Side by side comparison to the stage2 decoder with left the reduced instruction set and right a "C" like equivalent.
The block comments are written towards the instructions, the inline comments towards the language code.

```
	/*
	 * step-1: generate number
	 *
	 * Update hash at head of extracted data
	 */

	imul	$SEED,HEAD(%bx,%di),%si		 //* update hash	  **/	WORD si = (SEED * *pHash) & 0xffff;   
   	xorw	%si,HEAD(%bx,%di)		 //* number generator     **/	*pHash ^= si;
   	
	/*
	 * step-2: output byte
	 *
	 * If high bit of hash is set then the low byte is the next byte.
	 * Increment %bx to shift the hash one byte leaving the desired output byte behind
	 * 
	 * Trick by using a byte instead of word increment is, that the hash will inherit half the run-time information.
	 * This inheritance influences the outcome of the generator that can attain the next output value in a single cycle.  
	 * The encoder can use this knowledge to craft a lookahead, finding the shortest path to a specific state. 
	 */
	 
	jns	L2				//* is it cmd:byteReady   **/	if (*pHash & BYTEREADY)
	inc	%bx				//* shift output position **/		outPtr++;

	/*
	 * step-3: load next input byte
	 *
	 * Load next byte from input by incrementing %di, decrement %di to keep the output position
	 * Inject the loaded byte into the low-byte of the hash for maximum effect.
	 * Injecting into the low-byte has an undesired side-effect for step-4, so inject into the high-byte.
	 * Injection is a memory-memory operation, use %ah as intermediate byte. %ax is initially 0x0000.
	 */
L2:
	xorb	HEAD(%di),%ah			//* load next input byte  **/	BYTE ah = *inPtr;
	inc	%di				//* shift input position  **/	inPtr++;
	dec	%bx				//* relative / absolute   **/    
	xorb	%ah,HEAD+1(%bx,%di)		//* inject into generator **/	*pHash ^= ah << 8;

	/*
	 * step-4: loop until finished
	 *
	 * Injecting where the result is zero can be used as trigger to indicate end-of-sequence.
	 * This however should not happen for the low-byte because emitting a zero is a valid situation.
	 */
	 
	jne	stage2start		  //* repeat until end-of-sequence */	} UNTIL ((*pHash & 0xff00) == 0);
```

Loading and using a second register would increase the code size by some 30%.  
An alternative approach is to use a single pointer register and use a preloaded second for the relative distance.  
The register `%bx` has been inherited from stage 1, and it is initialised with the value zero.

There is a race condition at the very start.  
The input and output share the same location.  
Updating the generator hash would immediately corrupt the first two input characters.  
To avoid this situation, the next input byte should be located in front of the hash.

Stage2 needs to be able to access the heads of output and input which are located directly after stage2.

#### Stage3

Stage-2 mainloop is a streaming radix converter.  
Digits are considered radix10, lowercase is considered radix13.  
Output is radix256.

```
	// load next character from text data and increment
	WORD ax = *inPtr++;

	// test for alpha or numeric
	if (isDigit(ax))
		dx *= 10;	// grow pool for radix10
	else if (isAlpha(ax)
		dx *= 13;	// grow pool for radix13
	else
		continue;	// no, next character    

	// inject input value into pool
	dx += ax;

	// test if byte present
	if (dx & 0xff00) {
		// test for end-of-sequence     
		if (dx == 999)
			break; // found     

		// save byte and increment position
		*outPtr++ = dx & 0xff;

		// extract byte from pool
		dx >>= 8;  
	}
```

#### radix13 encoding

/our alphabet is beautiful/

The ascii art visuals require ascend lowercase letters, "acemnorsuvwxz".  
For the numerology, they represent the 13 values ranging from 0 to 12.  
A linear conversion from ascii to value is not available.  
A table lookup would be second choice.  
A 26 entry table is depreciated due to their memory footprint.

Time for analysis:

There are 26 lowercase letters.  
13 (exactly half) are desired to be used in text.  
Intuitively, the core of conversion routine would exploit halving the asci value.  
Displaying them in a 2x13 array and striking out the undesired:

```
ace***mo*suw*
******n*r*vxz
```

The top row holds the even ascii values, the bottom row holds the uneven.  
If each column is able to hold a single character, it would be an ideal situation.
If the bottom row were to rotate they might "sync" making conversion a linear function.

Rotating the bottom row to the left 7 places:

```
ace***mo*suw*
*r*vxz******n
```

That is a near perfect fit. The only letter standing out is "r".
Also, the "n" jumps location which complicates the code.

Shifting top row to the right 1, and bottom row to the left 6 places:

```
*ace***mo*suw
n*r*vxz******
         ^-----NOTE
```

There is an unused column, and by cosmic coincidence, it has the same position as the clashing "r" above.

Excluding the "r", shift the top row 1 to the right, and the bottom row 6 to the left.

```
*ace***mo*suw
n***vxz**r***
```

Perfect situation, as each column has a single character it is now easy to determine the ordinal value.  
However, all the ascii values are mixed making the ordinal value non-sensible.  
This is solved by the encoder transforming the letters values to match their location after being shifted.

The encoder maps values to letters using this table:

| value | character |
|:----:|:----:|
|  0 | n |
|  1 | a |
|  2 | c |
|  3 | e |
|  4 | v |
|  5 | x |
|  6 | z |
|  7 | m |
|  8 | o |
|  9 | r |
| 10 | s |
| 11 | u |
| 12 | w |

The decoder converts the letter to number using this code:

```
	sub	$'a',%al	// convert letter to ordinal number
	sub	$2,%al		// shift top/bottom row to the right 1 position
	shr	%al		// determine row/column
	jnc	done		// jump if even
	cmp	$9,%al		// what about "r"?
	je	done		// jump if "r"
	sub	$7,%al		// shift "vxz"
```

The first two instructions can be optimised in different ways.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/xyzzy/smile/tags).

## License

This project is licensed under GPLv3 - see the [LICENSE.txt](LICENSE.txt) file for details.

## Acknowledgments

* The designers behind the x86 instruction-set for choosing the opcode values for the instructions. 

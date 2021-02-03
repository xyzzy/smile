# Welcome to the Wonderful World of ASCII binaries

*When humans and machines share the same alphabet*

"Smile" is an executable ASCII and consists exclusively of digits and lowercase letters.

  - Viewed as text, it shows ascii art consisting of digits and the ascender free lowercase letter "acemnorsuvwxz".  
    The difference in contrast between the height of letters and digits should highlight the embedded artwork.

  - Running as a MS-DOS/FreeDOS binary, it displays a kaleidoscope.

Reducing the instruction set by removing all opcodes that are not alphanumerical, strips it basically down to only three instructions.  
Those three instructions are by an astronomical improbability capable to jailbreak those restrictions.

The code and analysis might look straight forward but bear in mind that more than 800 tries and attempts were made to find the magic combination of instructions.

`TL;DR` The juicy technical bit is the explanation of stage-1 below.

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
        xor     reg,OFS(reg,reg)
        xor     OFS(reg,reg),reg
        cmp     reg,OFS(reg,reg)
        imul    $IMM,(reg,reg),reg
        jXX     OFS
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
        xor     (breg,ireg),%si
        xor     (%si),%si
        xor     (%di),%si
        xor     (%bx),%si
        xor     OFS(breg,ireg),%si
        xor     OFS(reg),%si
        imul    $IMM,(breg,ireg),%si
        imul    $IMM,(%si),%si
        imul    $IMM,(%di),%si
        imul    $IMM,(%bx),%si
        imul    $IMM,OFS(breg,ireg),%si
        imul    $IMM,OFS(reg),%si
        imul    $IMM,(breg,ireg),%si
        imul    $IMM,(%si),%si
        imul    $IMM,(%di),%si
        imul    $IMM,(%bx),%si
        imul    $IMM,OFS(breg,ireg),%si
        imul    $IMM,OFS(reg),%si
```

### Instructions that write/modify `%di`

Initial value of `%di` is `0xfffe`

`%si` is needed to modify `%di`.

```assembly
        xor     (%bx,ireg),%di
        xor     OFS(%bx,ireg),%di
        xor     OFS(%bp,%si),%di
        imul    $IMM,(%bx,ireg),%di
        imul    $IMM,OFS(%bx,%ireg),%di
        imul    $IMM,OFS(%bp,%si),%di
```

### Instructions that write/modify `%bp`

Initial value of `%bp` is undefined.

Only way to write to `%bp` is by using `imul`.
The `imul` requires an ascii-safe register offset, requiring a preloaded anchor register.

```assembly
        xor     OFS(breg,ireg),%bp      
        xor     OFS(reg),%bp          
        imul    $IMM,OFS(breg,ireg),%bp 
        imul    $IMM,OFS(reg),%bp     
        imul    $IMM,OFS(breg,ireg),%bp 
        imul    $IMM,OFS(reg),%bp     
```

### Instructions that modify `%bx`

Initial value of `%bx` is 0x0000.

Only the high byte can be modified.  
`%bx` only use is for the number generator described below.

```assembly
        xor     (%bx,ireg),%bh
        xor     OFS(%bx,ireg),%bh
        xor     OFS(%bp,%si),%bh
```

### Instructions that can be used before an anchor register is loaded

The anchor register can be used with ascii-safe offsets to patch stage2.  
Excluding instructions that use the undefined `%bh` and `%bp`

```assembly
        xor     %si,(%bx,ireg)
        xor     %si,(%si)
        xor     %si,(%di)
        xor     %si,(%bx)
        xor     %di,(%bx,ireg)
        
        xor     (%bx,ireg),%si
        xor     (%si),%si
        xor     (%di),%si
        xor     (%bx),%si
        xor     (%bx,ireg),%di
        
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
    The ascii-safe instruction-set is incomplete to do anything really useful.  
    Unsafe bytes are made safe replacing them with a placeholder value that need to patched before the code can be executed.

  - Stage-1: The patcher.  
    A gem of improbability jumping through hoops to patch/self-modify stage-2 into something runnable.

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
        
        xor     %si,(reg)
        xor     ireg,(%bx,ireg)
        xor     (reg),%si
        xor     (%bx,ireg),ireg
       
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

Applying these as constraints to the set of base instructions above reduces it further to:

```assembler
        xor     %si,(%bx)
        xor     (%bx),%si
        imul	$IMM,(%bx),%si
```

These are the only three instructions available until `%si` or `%di` contains a reference location.

#### Number generator

Having `imul` and `xor` are perfect ingredients for a hash-function/number-generator.

The `imul` creates a new value based on a stored hash and given seed, and writes that to `%si`.  
A second step for continuation used the `xor` to update the hash value.

```assembler
        imul    $SEED,(%bx),%si         // next number in register
        xor     %si,(%bx)               // next number in memory
```

The idea is to craft a sequence of specific seed/multipliers that create the necessary values to patch stage 2.

```assembler
        // generate number
        imul    $SEED,(%bx),%si
        xor     %si,(%bx)

        // populate reference register %di (=%si+OFS)
        xor     OFS(%bx,%si),%di

        REPEAT {
                // generate number
                imul    $SEED,(%bx),%si
                xor     %si,(%bx)

                // patch memory
                xor     %si,OFS(%di)
        }
```

### Stage 2

With the added functionality of reading/writing a stream of data.
The input stream is limited range text and influences the number generator
The output stream are binary snapshots of the number generator.  
The encoder creates text that requires the least number of generator cycles.

Task is to load stage 3, an arithmetic based radix23 character encoding.  
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

	imul	$SEED,HEAD(%bx,%di),%si	  	   //*      update hash     **/     WORD si = (SEED * *pHash) & 0xffff;   
   	xorw	%si,HEAD(%bx,%di)		       //*     number generator **/     *pHash ^= si;
   	
	/*
	 * step-2: output byte
	 *
	 * If high bit of hash is set then low byte contains next byte.
	 * Increment %bx to shift hash one byte leaving the desired output byte behind
	 * 
     * Trick by using a byte increment is that the hash will inherit half the information.  
     * The encoder can use this knowledge to craft a lookahead, finding the shortest path to a specific state. 
	 */
	 
	jns     L2				              //* is it cmd:byteReady   **/     if (*pHash & BYTEREADY)
	inc	    %bx                           //* shift output position **/         outPtr++;

	/*
	 * step-3: load next input byte
	 *
	 * Load next byte from input by incrementing %di, decrement %di to keep the output position
	 * Inject the loaded byte into the low-byte of the hash for maximum effect.
	 * Injecting into the low-byte has an undesired side-effect for step-4, so inject into the high-byte.
	 * Injection is a memory-memory operation, use %ah as intermediate byte. %ax is initially 0x0000.
	 */
L2:
	xorb	HEAD(%di),%ah			      //* load next input byte  **/     BYTE ah = *inPtr;
	inc	%di				                  //* shift input position  **/     inPtr++;
	dec	%bx			            	      //* relative / absolute   **/    
	xorb	%ah,HEAD+1(%bx,%di)	          //* inject into generator **/     *pHash ^= ah << 8;

	/*
	 * step-4: loop until finished
	 *
	 * Injecting where the result is zero can be used as trigger to indicate end-of-sequence.
	 * This however should not happen for the low-byte because emitting a zero is a valid situation.
	 */
	 
	jne	stage2Start			        //* repeat until end-of-sequence */   } UNTIL ((*pHash & 0xff00) == 0);
```

Loading and using a second register would increase the code size by some 30%.  
An alternative approach is to use a single pointer register and save the relative distance.
The register `%bx` has been inherited from stage 1, and it is initialised with the value zero.

#### rot 13 rot 13

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/xyzzy/smile/tags).

## License

This project is licensed under GPLv3 - see the [LICENSE.txt](LICENSE.txt) file for details.

## Acknowledgments

* The designers behind the x86 instruction-set for choosing the opcode values for the instructions. 

/*
 *  This file is part of smile: ASCII binaries
 *
 *  The MIT License (MIT)
 *
 *  Copyright (C) 2018, xyzzy@rockingship.org
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the "Software"), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

/*
 gcc -m32 -march=i386 -mtune=i386 -g0 -c payload.c  -o payload.o -Os -fno-zero-initialized-in-bss -fomit-frame-pointer -fno-asynchronous-unwind-tables
 ld payload.o -T smile.lds --oformat binary -o payload.com -Ttext 100
*/

#define WIDTH 320
#define HEIGHT 200

__asm__ (".code16gcc");
__asm__ (".text");
__asm__ ("_start: mov $0,%ax; shr $4,%ax; movw %cs,%bx; addw %bx,%ax; mov %ax,%ds; jmp start");

#define SetVideoMode(AL) ({ unsigned char r; __asm__ __volatile__("int $0x10": "=a"(r) : "0"(0x00<<8|(AL))); r; })
#define SetColorBackground(COL) ({ unsigned char r; __asm__ __volatile__("int $0x10": "=a"(r) : "0"(0x0b00), "b"(0x00<<8|(COL))); r; })
#define ReadInputStatus() ({ unsigned short r; __asm__ __volatile__("int $0x21" : "=a"(r) : "0"(0x0b00)); r; })
#define ExitProgram(CODE) ({ unsigned short r; __asm__ __volatile__("int $0x21" : "=a"(r) : "0"(0x4c00|((CODE)&0xff))); r; })

extern unsigned char esByte[] asm ("%es:0");
extern unsigned char fsByte[] asm ("%fs:0");
extern unsigned char gsByte[] asm ("%gs:0");
extern unsigned short gsWord[] asm ("%gs:0");

#define DIAMONDS 0

int start() {

    unsigned char bgColour = 0; // background color
    unsigned char pattern1 = 0x05;
    unsigned char pattern2 = 0x01;
    unsigned char numStates = 0xff;
    unsigned char precise = 0x40;
    unsigned char liveOrDie = 1;

    SetVideoMode(0x13); // set video mode 320x200 40x25 @256 addr 0xA000 (VGA)
    if (bgColour)
        SetColorBackground(bgColour);

    //============================================================

    // set segments for far pointers
    unsigned short ds;
    __asm__ __volatile__("mov %%ds,%0" : "=R"(ds));
    __asm__ __volatile__("mov %0,%%es"::"a"(ds + 0x1000));
    __asm__ __volatile__("mov %0,%%fs"::"a"(ds + 0x3000));
    __asm__ __volatile__("mov %0,%%gs"::"a"(0xA000));

    // clear
    unsigned short j = WIDTH * HEIGHT - 1;
    do {
        j--;
        esByte[j] = fsByte[j] = 0;
    } while (j != 0);

    // set center spot
    fsByte[(HEIGHT + 2) / 2 * (WIDTH + 2) + (WIDTH + 2) / 2]++;

    while ((ReadInputStatus() & 0xff) == 0) {

        // wait-a-bit, use BIOS data area: Daily timer counter located at 40:006c

        __asm__ __volatile__("push %%gs; mov %0,%%gs"::"a"(0x0040));

        unsigned short t1 = ((volatile unsigned short *) gsWord)[0x6c / 2];
        do {
        } while (t1 == ((volatile unsigned short *) gsWord)[0x6c / 2]);

        __asm__ __volatile__("pop %gs");

        //============================================================

        unsigned short si = (WIDTH + 2) * (HEIGHT + 1) - 1;
        unsigned short bx = WIDTH * HEIGHT;

        do {

            int cx = WIDTH;
            do {
                si--;
                bx--;
                cx--;

                // get new pixel value
                unsigned char px = fsByte[si];

                if (px) {
                    px++;
                } else {
                    unsigned char dx = 0;

                    if (!DIAMONDS) {
                        dx += fsByte[si - WIDTH - 2 - 1] +
                              fsByte[si - WIDTH - 2 + 1] +
                              fsByte[si + WIDTH + 2 - 1] +
                              fsByte[si + WIDTH + 2 + 1];
                    }
                    dx += fsByte[si - WIDTH - 2] +
                          fsByte[si - 1] +
                          fsByte[si + 1] +
                          fsByte[si + WIDTH + 2];

                    px = 0;
                    if ((signed char) dx > precise || dx == pattern1 || dx == pattern2)
                        px = 1;
                }

                if (px == numStates) {
                    px = liveOrDie;
                    fsByte[(HEIGHT + 2) / 2 * (WIDTH + 2) + (WIDTH + 2) / 2]++;
                }

                // write pixel to SCREEN
                esByte[si] = px;
                gsByte[bx] = px;
            } while (cx != 0);

            si -= 2;

        } while (bx != 0);

        // swap ef/fs
        __asm__ __volatile__ ("push %es; push %fs; pop %es; pop %fs");

    }

    SetVideoMode(0x03); // set video mode 640x200 80x25 @16 addr 0xB800 (CGA)
    ExitProgram(0);
    for (;;); // suppress generation of return overhead
}

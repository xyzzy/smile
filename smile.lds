OUTPUT_FORMAT("binary")
OUTPUT_ARCH(i386)
SECTIONS
{

	.text 0x0100 : AT (0) ALIGN(0) SUBALIGN(0) {
		*(.text) *(.text.*)
	}

	.data : AT (SIZEOF(.text)) ALIGN(0) SUBALIGN(0) {
		*(.rodata .rodata.*)
		*(.data .data.*)

	}

	.bss : ALIGN(0) SUBALIGN(0) {
		*(.bss)
		*(COMMON)
	}

	/DISCARD/ : { *(.comment) *(.iplt) *(.rel.dyn) *(.igot.plt) *(.eh_frame) }

}

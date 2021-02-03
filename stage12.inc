// STAGE-1 config
OFSDI = 'f'     // multiplier for initial %di
HEAD = 's'      // %di offset to encoded stage3 DATA
IMM1 = 0x7872   // multiplier for step-1
IMM2 = 0x75     // multiplier for step-2
IMM3 = 0x6c     // multiplier for step-3
IMM4 = 0x72     // multiplier for step-4
IMM5 = 0x67     // multiplier for step-5

// Patch config
OFSMEM1 = 'f'   // patch offset for step-4
FIX1H = 'b'     // patch for HI-byte
FIX1L = '2'     // patch for LO-byte
OFSMEM2 = 'k'   // patch offset for step-4
FIX2H = 'j'     // patch for HI-byte
FIX2L = 'q'     // patch for LO-byte
OFSMEM3 = 'p'   // patch offset for step-5
FIX3H = 'r'     // patch for HI-byte
FIX3L = '0'     // patch for LO-byte

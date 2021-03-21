AC_INIT([smile], [1.1.0])
AC_CONFIG_SRCDIR([configure.ac])
AC_CONFIG_AUX_DIR([m4])
AC_CONFIG_MACRO_DIRS([m4])
AM_INIT_AUTOMAKE([foreign])
AM_CONFIG_HEADER([config.h])

AC_PROG_INSTALL
AM_PROG_AS
AC_PROG_CC
AC_PROG_LN_S

AC_CHECK_PROG(NODE,[node],[node],[no])
if [ test x"$NODE" == x"no" ] ; then
        AC_MSG_ERROR([Required program 'node' not found.])
fi

AC_CONFIG_FILES([Makefile])
AC_OUTPUT

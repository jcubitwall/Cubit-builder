
FILE_EXTENSION = "tap"

UNITS = "INCHES"

+------------------------------------------------
+    Line terminating characters
+------------------------------------------------

LINE_ENDING = "[13][10]"

+------------------------------------------------
+    Block numbering
+------------------------------------------------

LINE_NUMBER_START     = 0
LINE_NUMBER_INCREMENT = 10
LINE_NUMBER_MAXIMUM = 999999

+================================================
+
+    Formating for variables
+
+================================================

VAR LINE_NUMBER = [N|A|N|1.0]
VAR SPINDLE_SPEED = [S|A|S|1.0]
VAR FEED_RATE = [F|C|F|1.1]
VAR X_POSITION = [X|C|X|1.4]
VAR Y_POSITION = [Y|C|Y|1.4]
VAR Z_POSITION = [Z|C|Z|1.4]
VAR ARC_CENTRE_I_INC_POSITION = [I|A|I|1.4]
VAR ARC_CENTRE_J_INC_POSITION = [J|A|J|1.4]
VAR X_HOME_POSITION = [XH|A|X|1.4]
VAR Y_HOME_POSITION = [YH|A|Y|1.4]
VAR Z_HOME_POSITION = [ZH|A|Z|1.4]
VAR DWELL_TIME = [DWELL|A|X|1.2]

+================================================
+
+    Block definitions for toolpath output
+
+================================================

+---------------------------------------------------
+  Commands output at the start of the file
+---------------------------------------------------

begin HEADER

"G90"
"G0 [ZH]"
"G0 [XH] [YH]"
"M5"
"T[T]"
"[S]"
"M50"
"M3"
"g4 x 4"
"G0 [ZH]"
"G0 [XH] [YH]"
"F[FC] XY"
"F[FP] Z"
+---------------------------------------------------
+  Commands output for rapid moves
+---------------------------------------------------

begin RAPID_MOVE

"G0 [X] [Y] [Z]"


+---------------------------------------------------
+  Commands output for the first feed rate move
+---------------------------------------------------

begin FIRST_FEED_MOVE

"G1 [X] [Y] [Z] [F]"


+---------------------------------------------------
+  Commands output for feed rate moves
+---------------------------------------------------

begin FEED_MOVE

"G1 [X] [Y] [Z]"

+---------------------------------------------------
+  Commands output for first clockwise arc  moves
+---------------------------------------------------

begin FIRST_CW_ARC_MOVE

"G2 [X] [Y] [I] [J] [F]"

+---------------------------------------------------
+  Commands output for clockwise arc  moves
+---------------------------------------------------

begin CW_ARC_MOVE

"G2 [X] [Y] [I] [J]"

+---------------------------------------------------
+  Commands output for first counterclockwise arc  moves
+---------------------------------------------------

begin FIRST_CCW_ARC_MOVE

"G3 [X] [Y] [I] [J] [F]"

+---------------------------------------------------
+  Commands output for counterclockwise arc  moves
+---------------------------------------------------

begin CCW_ARC_MOVE

"G3 [X] [Y] [I] [J]"

+---------------------------------------------------
+  Commands output for first clockwise helical arc  moves
+---------------------------------------------------

begin FIRST_CW_HELICAL_ARC_MOVE

"G2 [X] [Y] [Z] [I] [J] [F]"

+---------------------------------------------------
+  Commands output for clockwise helical arc  moves
+---------------------------------------------------

begin CW_HELICAL_ARC_MOVE

"G2 [X] [Y] [Z] [I] [J]"

+---------------------------------------------------
+  Commands output for first counterclockwise helical arc  moves
+---------------------------------------------------

begin FIRST_CCW_HELICAL_ARC_MOVE

"G3 [X] [Y] [Z] [I] [J] [F]"

+---------------------------------------------------
+  Commands output for counterclockwise helical arc  moves
+---------------------------------------------------

begin CCW_HELICAL_ARC_MOVE

"G3 [X] [Y] [Z] [I] [J]"

+---------------------------------------------------
+  Commands output for first clockwise helical arc plunge moves
+---------------------------------------------------

begin FIRST_CW_HELICAL_ARC_PLUNGE_MOVE

"G2 [X] [Y] [Z] [I] [J] [F]"

+---------------------------------------------------
+  Commands output for clockwise helical arc plunge moves
+---------------------------------------------------

begin CW_HELICAL_ARC_PLUNGE_MOVE

"G2 [X] [Y] [Z] [I] [J]"

+---------------------------------------------------
+  Commands output for first counter clockwise helical arc plunge moves
+---------------------------------------------------

begin FIRST_CCW_HELICAL_ARC_PLUNGE_MOVE

"G3 [X] [Y] [Z] [I] [J] [F]"

+---------------------------------------------------
+  Commands output for counter clockwise helical arc plunge moves
+---------------------------------------------------

begin CCW_HELICAL_ARC_PLUNGE_MOVE

"G3 [X] [Y] [Z] [I] [J]"

+---------------------------------------------------
+   Begin new segment
+---------------------------------------------------

begin NEW_SEGMENT
"[S]"
"F[FC] XY"
"F[FP] Z"

+---------------------------------------------------
+  Commands output at toolchange
+---------------------------------------------------

begin TOOLCHANGE

"M5"
"T[T]"
"[S]"
"M3"
"g4 x 4"
"F[FC] XY"
"F[FP] Z"

+---------------------------------------------
+  Commands output for a dwell move
+---------------------------------------------

begin DWELL_MOVE

"G4[DWELL]"

+---------------------------------------------------
+  Commands output at the end of the file
+---------------------------------------------------

begin FOOTER

"G0 [ZH]"
"G0 [XH] [YH]"
"M5"
"m51"

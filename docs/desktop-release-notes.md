# pre-midi 0.14.1-preview.39 Windows portable

## Changes since preview.38

- Automate all continuous controls on the ten dynamics and modulation-effect types, including wet/dry mix and stepped enable. Effects retain their audio history while switching.
- Write automation gestures for vocal Clips and selected Freeform notes. The editor maps playback to the original source curve. Release the control to apply the gesture as one undoable edit.
- Dynamics panels show the peak gain reduction measured from the Sound preview, including wet/dry mixing. Makeup gain is excluded from this attenuation measurement.
- Automated modulation-effect rates retain phase through seek, and exports include the tails required by changing delay and feedback.

## Install and test

Extract the whole ZIP to a writable folder and open pre-midi.exe. For a manual update, close the app and replace the application files. Keep your data/, projects/ and exports/ folders.

Try a compressor threshold curve and a chorus delay curve, then play, pause, seek and resume. Try switching an effect off and back on with an enabled lane. Write a gesture during a vocal Clip and undo it. The dynamics measurement describes the rendered Sound preview.

This is a manual Windows 11 x64 portable preview. Shared Track buses, external sidechains, further automation destinations, monitored live override/rejoin and physical audio testing remain open.

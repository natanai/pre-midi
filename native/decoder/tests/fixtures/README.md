These original synthetic fixtures are generated from a 440 Hz, 48 kHz stereo sine tone (0.1 s) with FFmpeg. No third-party recordings are included.

Generate tone.wav with lavfi `sine=frequency=440:sample_rate=48000:duration=0.1`, two channels, pcm_s16le. Encode that WAV with libmp3lame (tone.mp3), libvorbis (vorbis.ogg), libopus (opus.ogg and tone.webm), and aac (tone.mp4). All use FFmpeg default codec settings. The tests check finite/audible output, sample rate, channel count and duration; they do not infer listening quality from successful decoding.

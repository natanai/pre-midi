#pragma once
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct {
 uint64_t callbacks,frames,total_ns,max_ns,deadline_misses,oversized,clipped,peak_million,position,active,state,fault,admitted,stolen;
 uint32_t sample_rate,hardware_rate,period_frames,period_count,device_lost,test_backend;
 uint64_t lead_remaining,preview_position,preview_state,capture_phase,capture_frames,capture_missing,capture_clipped,capture_peak_million,capture_lead,capture_start;
} premidi_audio_status;
typedef struct {uint32_t id,rate,channels;uint64_t frames;double normalization;} premidi_sample_info;
typedef struct {
 uint64_t position,ack_sequence,ack_end_frame,released_through;
 uint32_t state,fault,sample_rate,active;
} premidi_stream_status;
typedef struct {double mix,preDelay,decay,damping,size,width;} premidi_reverb_parameters;
#ifdef __cplusplus
#define PREMIDI_ROOM_DEFAULT =nullptr
#else
#define PREMIDI_ROOM_DEFAULT
#endif
int premidi_audio_stream_begin(void* host,uint64_t owner,uint64_t revision,int resource_flags); // bit 0 tone graph, bit 1 post delay storage
int premidi_audio_stream_effects(void* host,uint64_t owner,uint64_t revision,double mix,double time,double feedback,double tone,int ping,const premidi_reverb_parameters* room PREMIDI_ROOM_DEFAULT);
#undef PREMIDI_ROOM_DEFAULT
int premidi_audio_stream_page(void* host,uint64_t owner,uint64_t revision,uint64_t sequence,uint64_t first_frame,uint64_t end_frame,uint32_t onsets,int last,const uint8_t* packet,size_t length);
int premidi_audio_stream_start(void* host,uint64_t owner,uint64_t revision);
int premidi_audio_stream_advance(void* host,uint64_t owner,uint64_t revision,uint64_t frame);
int premidi_audio_stream_start_take(void* host,uint64_t owner,uint64_t revision,double bpm,uint32_t bars,int recording,double seconds,uint64_t due,int hold);
int premidi_audio_stream_stop(void* host,uint64_t owner,uint64_t revision);
int premidi_audio_stream_status_get(void* host,premidi_stream_status* status);

void* premidi_audio_create(int test_backend);
void premidi_audio_destroy(void* host);
const char* premidi_audio_error(void* host);
int premidi_audio_devices(void* host);
const char* premidi_audio_device_name(void* host,uint32_t index);
const char* premidi_audio_backend(void* host);
int premidi_audio_configure(void* host,uint32_t device,uint32_t sample_rate,uint32_t period_frames);
int premidi_audio_play(void* host,const uint8_t* data,size_t length,double cycle,double seek,int loop,int preview);
// Lock-free mute request; safe to call from outside the control worker while the host lives.
void premidi_audio_request_transport_stop(void* host);
// Claim on the control thread before preparation. Serialize claims with urgent
// requests on the host lifetime lock; only a new owner clears transport intent.
void premidi_audio_claim_transport(void* host,uint64_t owner);
// Atomic intent only: no parsing, device API, waiting, or Session mutation.
void premidi_audio_request_transport_state(void* host,uint32_t command);
int premidi_audio_control(void* host,uint32_t command,int loop);
int premidi_audio_status_get(void* host,premidi_audio_status* status);
int premidi_audio_add_sample(void* host,const float* pcm,uint64_t frames,uint32_t rate,uint32_t channels,premidi_sample_info* info);
int premidi_audio_add_sample_rate(void* host,const float* pcm,uint64_t frames,uint32_t rate,uint32_t channels,premidi_sample_info* info,uint32_t target_rate);
int premidi_audio_update(void* host,const uint8_t* data,size_t length,double cycle,int loop,double tempo_ratio);
int premidi_audio_render(void* host,const uint8_t* data,size_t length,double cycle,uint32_t rate,uint64_t frames,uint8_t* output,size_t output_bytes,uint32_t format,double gain);
int premidi_audio_play_take(void* host,const uint8_t* data,size_t length,double cycle,double seek,int loop,int preview,double bpm,uint32_t count_bars,int record);
int premidi_audio_capture_prepare(void* host,double seconds,double offset_ms,int synchronized);
int premidi_audio_capture_start(void* host,double lead_seconds);
int premidi_audio_capture_finish(void* host,int cancel);
uint64_t premidi_audio_capture_size(void* host);
int premidi_audio_capture_copy(void* host,float* output,uint64_t frames);
int premidi_audio_preview_control(void* host,uint32_t command);
int premidi_audio_resample(const float* input,uint64_t frames,uint32_t rate,uint32_t channels,uint32_t target_rate,float* output,uint64_t output_frames,uint32_t output_channels);
#ifdef __cplusplus
}
#endif

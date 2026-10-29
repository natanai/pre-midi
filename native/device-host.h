#pragma once
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef struct {
 uint64_t callbacks,frames,total_ns,max_ns,deadline_misses,oversized,clipped,peak_million,position,active,state,fault,admitted,stolen;
 uint32_t sample_rate,hardware_rate,period_frames,period_count,device_lost,test_backend;
} premidi_audio_status;
typedef struct {uint32_t id,rate,channels;uint64_t frames;double normalization;} premidi_sample_info;
void* premidi_audio_create(int test_backend);
void premidi_audio_destroy(void* host);
const char* premidi_audio_error(void* host);
int premidi_audio_devices(void* host);
const char* premidi_audio_device_name(void* host,uint32_t index);
const char* premidi_audio_backend(void* host);
int premidi_audio_configure(void* host,uint32_t device,uint32_t sample_rate,uint32_t period_frames);
int premidi_audio_play(void* host,const uint8_t* data,size_t length,double cycle,double seek,int loop,int preview);
int premidi_audio_control(void* host,uint32_t command,int loop);
int premidi_audio_status_get(void* host,premidi_audio_status* status);
int premidi_audio_add_sample(void* host,const float* pcm,uint64_t frames,uint32_t rate,uint32_t channels,premidi_sample_info* info);
#ifdef __cplusplus
}
#endif

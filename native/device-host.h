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
#ifdef __cplusplus
}
#endif

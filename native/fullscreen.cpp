#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <dwmapi.h>
#include <cstdio>
#include <cmath>
int main() {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  char line[256];
  while (fgets(line,sizeof(line),stdin)) {
    unsigned long ignoredPID;double x,y,width,height;bool full=false;
    if(sscanf_s(line,"%lu %lf %lf %lf %lf",&ignoredPID,&x,&y,&width,&height)==5) {
      HWND window=GetForegroundWindow();DWORD pid=0;GetWindowThreadProcessId(window,&pid);
      wchar_t name[64]={0};GetClassNameW(window,name,64);
      DWORD cloaked=0;DwmGetWindowAttribute(window,DWMWA_CLOAKED,&cloaked,sizeof(cloaked));
      if(window && pid!=ignoredPID && IsWindowVisible(window) && !cloaked && wcscmp(name,L"Progman") && wcscmp(name,L"WorkerW")) {
        RECT bounds={0};
        if(FAILED(DwmGetWindowAttribute(window,DWMWA_EXTENDED_FRAME_BOUNDS,&bounds,sizeof(bounds))))GetWindowRect(window,&bounds);
        full=fabs(bounds.left-x)<=3 && fabs(bounds.top-y)<=3 && fabs((bounds.right-bounds.left)-width)<=3 && fabs((bounds.bottom-bounds.top)-height)<=3;
      }
    }
    puts(full?"1":"0");fflush(stdout);
  }
  return 0;
}

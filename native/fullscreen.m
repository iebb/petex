#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <math.h>
// Only return a boolean. Never request capture/accessibility permissions or read titles.
int main(void) {
  char line[256];
  while (fgets(line,sizeof(line),stdin)) {
    @autoreleasepool {
      [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.005]];
      int ignoredPID; double x,y,width,height; BOOL full=NO;
      NSDictionary *session=CFBridgingRelease(CGSessionCopyCurrentDictionary());
      BOOL locked=[session[@"CGSSessionScreenIsLocked"] boolValue];
      if (sscanf(line,"%d %lf %lf %lf %lf",&ignoredPID,&x,&y,&width,&height)==5) {
        NSRunningApplication *front=[NSWorkspace sharedWorkspace].frontmostApplication;
        pid_t frontPID=front.processIdentifier;
        if(frontPID && frontPID!=ignoredPID) {
          NSArray *windows=CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly|kCGWindowListExcludeDesktopElements,kCGNullWindowID));
          for (NSDictionary *window in windows) {
            if([window[(__bridge NSString *)kCGWindowOwnerPID] intValue]!=frontPID || [window[(__bridge NSString *)kCGWindowLayer] intValue]!=0)continue;
            CGRect bounds;
            if(!CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)window[(__bridge NSString *)kCGWindowBounds],&bounds))continue;
            if(fabs(bounds.origin.x-x)<=3 && fabs(bounds.origin.y-y)<=3 && fabs(bounds.size.width-width)<=3 && fabs(bounds.size.height-height)<=3) {full=YES;break;}
          }
        }
      }
      puts(locked?"-1":full?"1":"0");fflush(stdout);
    }
  }
  return 0;
}

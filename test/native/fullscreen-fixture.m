#import <Cocoa/Cocoa.h>
#include <stdio.h>
@interface PetexTestWindow : NSWindow
@end
@implementation PetexTestWindow
- (NSRect)constrainFrameRect:(NSRect)frame toScreen:(NSScreen *)screen {return frame;}
- (BOOL)canBecomeKeyWindow {return YES;}
- (BOOL)canBecomeMainWindow {return YES;}
@end
@interface PetexTestDelegate : NSObject <NSApplicationDelegate>
@property(strong) NSWindow *window;
@end
@implementation PetexTestDelegate
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  self.window=[[PetexTestWindow alloc] initWithContentRect:[NSScreen mainScreen].frame styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
  self.window.backgroundColor=[NSColor darkGrayColor];
  self.window.collectionBehavior=NSWindowCollectionBehaviorCanJoinAllSpaces;
  [self.window setFrame:[NSScreen mainScreen].frame display:YES];
  [self.window makeKeyAndOrderFront:nil];
  [NSApp activateIgnoringOtherApps:YES];
}
@end
int main(void) {
  @autoreleasepool {
    [NSApplication sharedApplication];[NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
    PetexTestDelegate *delegate=[PetexTestDelegate new];NSApp.delegate=delegate;
    [NSApp run];
  }
}

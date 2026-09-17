import Cocoa
import AVFoundation

// A loop of video pinned to the desktop level: under the icons, over the
// wallpaper. macOS has no supported way to set a movie as wallpaper, so the
// movie becomes a window at the same layer the wallpaper itself occupies.

@MainActor
func run() {
    let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
    guard FileManager.default.fileExists(atPath: path) else {
        FileHandle.standardError.write(Data("zoe-desktop-movie: no such file: \(path)\n".utf8))
        exit(1)
    }
    let url = URL(fileURLWithPath: path)

    NSApplication.shared.setActivationPolicy(.accessory)

    var windows: [NSWindow] = []
    var loopers: [AVPlayerLooper] = []

    func open(_ screen: NSScreen) {
        let queue = AVQueuePlayer()
        queue.isMuted = true
        loopers.append(AVPlayerLooper(player: queue, templateItem: AVPlayerItem(url: url)))

        let window = NSWindow(
            contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)))
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        window.ignoresMouseEvents = true
        window.hasShadow = false
        window.backgroundColor = .black
        window.isReleasedWhenClosed = false

        let view = NSView(frame: NSRect(origin: .zero, size: screen.frame.size))
        view.wantsLayer = true
        let layer = AVPlayerLayer(player: queue)
        layer.frame = view.bounds
        layer.videoGravity = .resizeAspectFill
        view.layer?.addSublayer(layer)
        window.contentView = view

        window.orderFrontRegardless()
        queue.play()
        windows.append(window)
    }

    for screen in NSScreen.screens { open(screen) }

    NotificationCenter.default.addObserver(
        forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
    ) { _ in
        MainActor.assumeIsolated {
            for window in windows { window.close() }
            windows = []
            loopers = []
            for screen in NSScreen.screens { open(screen) }
        }
    }

    signal(SIGTERM) { _ in exit(0) }
    signal(SIGINT) { _ in exit(0) }

    NSApplication.shared.run()
}

MainActor.assumeIsolated { run() }

import Cocoa
import AVFoundation

// A loop of video pinned to the desktop level: under the icons, over the
// wallpaper. macOS has no supported way to set a movie as wallpaper, so the
// movie becomes a window at the same layer the wallpaper itself occupies.
//
// The clip comes back from the video model with a last frame that does not sit
// exactly on the first one, and that difference reads as a jump every time the
// loop turns over. So the tail is dissolved into the head before the movie
// plays: the piece that repeats begins on the frame the old ending was fading
// into, and ends on that same frame, so the loop closes on itself.

let FADE = 0.4

@MainActor
func loopItem(for url: URL) -> AVPlayerItem {
    let asset = AVURLAsset(url: url)
    let seconds = CMTimeGetSeconds(asset.duration)
    let source = asset.tracks(withMediaType: .video).first
    if source == nil || seconds <= FADE * 2 {
        FileHandle.standardError.write(Data(
            "zoe-desktop-movie: \(url.lastPathComponent) is not a clip to loop (\(seconds)s, no usable video track)\n".utf8))
        exit(1)
    }

    let whole = CMTime(seconds: seconds, preferredTimescale: 600)
    let fade = CMTime(seconds: FADE, preferredTimescale: 600)
    let body = CMTimeSubtract(whole, fade)

    let composition = AVMutableComposition()
    let head = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
    let tail = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
    guard let head, let tail else {
        FileHandle.standardError.write(Data("zoe-desktop-movie: cannot lay out a loop over \(url.lastPathComponent)\n".utf8))
        exit(1)
    }

    do {
        // The clip without its last half second, and separately that last half second,
        // both starting at zero so the fade happens at the top of the loop.
        try head.insertTimeRange(CMTimeRange(start: .zero, duration: body), of: source!, at: .zero)
        try tail.insertTimeRange(CMTimeRange(start: body, duration: fade), of: source!, at: .zero)
    } catch {
        FileHandle.standardError.write(Data("zoe-desktop-movie: cannot cut \(url.lastPathComponent): \(error)\n".utf8))
        exit(1)
    }

    // The tail sits at full strength underneath while the head fades in over
    // it. Only one opacity moves, so the two add up to one picture the whole
    // way through and the screen does not dip dark in the middle of the join.
    let window = CMTimeRange(start: .zero, duration: fade)
    let headIn = AVMutableVideoCompositionLayerInstruction(assetTrack: head)
    headIn.setTransform(source!.preferredTransform, at: .zero)
    headIn.setOpacityRamp(fromStartOpacity: 0, toEndOpacity: 1, timeRange: window)

    let tailUnder = AVMutableVideoCompositionLayerInstruction(assetTrack: tail)
    tailUnder.setTransform(source!.preferredTransform, at: .zero)

    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: body)
    instruction.layerInstructions = [headIn, tailUnder]

    let shown = source!.naturalSize.applying(source!.preferredTransform)
    let video = AVMutableVideoComposition()
    video.renderSize = CGSize(width: abs(shown.width), height: abs(shown.height))
    video.frameDuration = CMTime(value: 1, timescale: CMTimeScale(max(1, source!.nominalFrameRate.rounded())))
    video.instructions = [instruction]

    let item = AVPlayerItem(asset: composition)
    item.videoComposition = video
    return item
}

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
        loopers.append(AVPlayerLooper(player: queue, templateItem: loopItem(for: url)))

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


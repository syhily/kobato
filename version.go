package main

import (
	"fmt"
	"runtime"
)

// Options for the Kobato API server.
const (
	// Banner header for the Kobato API server. Plan to change it to a more stylish one.
	bannerHeader = ` __   ___   ______    _______       __  ___________  ______
|/"| /  ") /    " \  |   _  "\     /""\("     _   ")/    " \
(: |/   / // ____  \ (. |_)  :)   /    \)__/  \\__/// ____  \
|    __/ /  /    ) :)|:     \/   /' /\  \  \\_ /  /  /    ) :)
(// _  \(: (____/ // (|  _  \\  //  __'  \ |.  | (: (____/ //
|: | \  \\        /  |: |_)  :)/   /  \\  \\:  |  \        /
(__|  \__)\"_____/   (_______/(___/    \___)\__|   \"_____/

Kobato :: %s :: %s

`
)

var (
	gitTag    = "1.0.0-dev"
	gitCommit = "" // sha1 from git, output of $(git rev-parse HEAD)
	buildDate = "" // build date in ISO8601 format, output of $(date -u +'%Y-%m-%dT%H:%M:%SZ')
)

func ShortVersion() string {
	return gitTag
}

func LongVersion() string {
	platform := fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH)
	goVersion := runtime.Version()
	return fmt.Sprintf("%s (commit: %s, built at: %s, platform: %s, go: %s)", gitTag, gitCommit, buildDate, platform, goVersion)
}

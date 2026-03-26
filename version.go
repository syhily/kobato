package main

import (
	"fmt"
	"runtime"
)

var (
	gitTag    = ""
	gitCommit = "" // sha1 from git, output of $(git rev-parse HEAD)
	buildDate = "" // build date in ISO8601 format, output of $(date -u +'%Y-%m-%dT%H:%M:%SZ')
)

func ShortVersion() string {
	if gitTag != "" {
		return gitTag
	}
	return "0.0.0-dev"
}

func LongVersion() string {
	platform := fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH)
	goVersion := runtime.Version()
	if gitTag != "" {
		return fmt.Sprintf("%s (commit: %s, built at: %s, platform: %s, go: %s)", gitTag, gitCommit, buildDate, platform, goVersion)
	}
	return fmt.Sprintf("%s (platform: %s, go: %s)", ShortVersion(), platform, goVersion)
}

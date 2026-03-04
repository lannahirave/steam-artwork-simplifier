$ErrorActionPreference = 'Stop'

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

function New-Fixture {
  param(
    [string]$Name,
    [string]$VideoSrc,
    [string]$AudioSrc,
    [double]$Duration,
    [string]$Vf = ''
  )

  $out = Join-Path $dir $Name
  $args = @(
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', $VideoSrc
  )

  if ($AudioSrc -ne '') {
    $args += @('-f', 'lavfi', '-i', $AudioSrc)
  }

  $args += @('-t', "$Duration")

  if ($Vf -ne '') {
    $args += @('-vf', $Vf)
  }

  $args += @(
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-crf', '28'
  )

  if ($AudioSrc -ne '') {
    $args += @('-c:a', 'aac', '-b:a', '96k', '-shortest')
  } else {
    $args += @('-an')
  }

  $args += @($out)

  & ffmpeg @args
}

New-Fixture -Name 'fixture01_square_576x576_25fps_13s.mp4' -VideoSrc 'testsrc2=size=576x576:rate=25' -AudioSrc 'sine=frequency=880:sample_rate=48000' -Duration 13
New-Fixture -Name 'fixture02_landscape_1280x720_30fps_8s.mp4' -VideoSrc 'testsrc2=size=1280x720:rate=30' -AudioSrc 'sine=frequency=440:sample_rate=48000' -Duration 8
New-Fixture -Name 'fixture03_portrait_720x1280_30fps_8s.mp4' -VideoSrc 'testsrc2=size=720x1280:rate=30' -AudioSrc 'sine=frequency=660:sample_rate=48000' -Duration 8
New-Fixture -Name 'fixture04_small_320x240_12fps_6s.mp4' -VideoSrc 'testsrc2=size=320x240:rate=12' -AudioSrc '' -Duration 6
New-Fixture -Name 'fixture05_long_640x360_24fps_20s.mp4' -VideoSrc 'testsrc2=size=640x360:rate=24' -AudioSrc 'sine=frequency=520:sample_rate=48000' -Duration 20
New-Fixture -Name 'fixture06_highfps_854x480_60fps_6s.mp4' -VideoSrc 'testsrc2=size=854x480:rate=60' -AudioSrc 'sine=frequency=330:sample_rate=48000' -Duration 6
New-Fixture -Name 'fixture07_dark_640x360_24fps_10s.mp4' -VideoSrc 'testsrc2=size=640x360:rate=24' -AudioSrc '' -Duration 10 -Vf 'eq=brightness=-0.35:saturation=0.40:contrast=0.90'
New-Fixture -Name 'fixture08_large_square_1024x1024_30fps_5s.mp4' -VideoSrc 'testsrc2=size=1024x1024:rate=30' -AudioSrc 'sine=frequency=1000:sample_rate=48000' -Duration 5

Get-ChildItem $dir -Filter '*.mp4' |
  Sort-Object Name |
  Select-Object Name, Length, LastWriteTime

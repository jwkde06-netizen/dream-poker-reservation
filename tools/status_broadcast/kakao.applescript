-- Standalone sender adapter. Not executed by the coding agent.
-- Requires explicit approval for AppleScript UI control and macOS permissions.
on roomWindow(roomTitle)
    tell application "System Events"
        set ps to application processes whose bundle identifier is "com.kakao.KakaoTalkMac"
        if (count of ps) is not 1 then error "KakaoTalk must be running"
        set proc to item 1 of ps
        set wins to windows of proc whose name is roomTitle
        if (count of wins) is not 1 then error "Open the exact Dream room in its own window"
        return item 1 of wins
    end tell
end roomWindow

on composerOf(win)
    tell application "System Events"
        set matches to {}
        repeat with el in (entire contents of win)
            try
                if role of el is "AXTextArea" and description of el is "메시지 입력" then set end of matches to contents of el
            end try
        end repeat
        if (count of matches) is not 1 then error "Composer is missing or ambiguous"
        return item 1 of matches
    end tell
end composerOf

on assertRoom(win, body)
    tell application "System Events"
        repeat with el in (entire contents of win)
            try
                set txt to value of el as text
                if txt contains "이용제한" or txt contains "이용 제한" or txt contains "보호조치" then error "Restriction warning — stop" number 771
                if role of el is "AXTextArea" and description of el is not "메시지 입력" and txt is body then error "Matching announcement already visible — reconcile" number 772
            on error messageText number errorNumber
                if errorNumber is 771 or errorNumber is 772 then error messageText number errorNumber
            end try
        end repeat
    end tell
end assertRoom

on run argv
    if (count of argv) is not 3 then error "Expected mode, room and body"
    set runMode to item 1 of argv
    set roomTitle to item 2 of argv
    set body to item 3 of argv
    if roomTitle is not "다낭 홀덤 DREAM Poker" then error "Wrong destination"
    if body does not start with "📢 드림포커 실시간 현황" then error "Wrong template"
    ignoring case
        if body contains "캐시" or body contains "cash" or body contains "5/5" or body contains "MILLION" or body contains "밀리언" then error "Disallowed public content"
    end ignoring
    if runMode is not "prepare" and runMode is not "send" then error "Unknown mode"
    set win to my roomWindow(roomTitle)
    my assertRoom(win, body)
    set input to my composerOf(win)
    tell application "System Events"
        if runMode is "prepare" then
            if (value of input as text) is not "" then error "Composer is not empty — user draft preserved"
            set value of input to body
            if (value of input as text) is not body then error "Composer write failed"
            return "OK"
        end if
        if (value of input as text) is not body then error "Composer changed — stop"
        set proc to first application process whose bundle identifier is "com.kakao.KakaoTalkMac"
        set frontmost of proc to true
        perform action "AXRaise" of win
        set focused of input to true
        if name of front window of proc is not roomTitle then error "Wrong foreground room"
        if not focused of input then error "Composer not focused"
        key code 36
    end tell
    -- Acknowledgment is a matching non-composer text area plus emptied composer.
    repeat 10 times
        delay 0.5
        set win to my roomWindow(roomTitle)
        set input to my composerOf(win)
        tell application "System Events"
            if (value of input as text) is "" then
                repeat with el in (entire contents of win)
                    try
                        if role of el is "AXTextArea" and value of el as text is body then return "OK"
                    end try
                end repeat
            end if
        end tell
    end repeat
    error "No matching posted message — inspect before any retry"
end run

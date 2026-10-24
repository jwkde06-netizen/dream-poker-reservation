export type ReservationLanguage = 'ko' | 'en' | 'vi';

const en = {
 desk:'Korean desk', cashier:'Cashier', guestPage:'Guest page', logout:'Log out', test:'Test only', live:'Live',
 testWarning:'Test reservations are not sent to Telegram or the settlement sheet.', prepareTest:'Prepare test game',
 connected:'Connected', disconnected:'Check connection', polling:'Auto-check every 2 seconds', refresh:'Refresh',
 pendingCount:'Awaiting review', confirmedCount:'Confirmed guests', arrivedCount:'Arrived', add:'Add reservation',
 request:'Reservation request', changeRequest:'Request change', name:'Name (English)', game:'Game', choose:'Select',
 arrival:'Arrival time', arrivalVN:'Arrival time (Vietnam)', guests:'Guests', people:'people', person:'person', note:'Note',
 saving:'Saving…', submit:'Send request', submitChange:'Request change approval', closeChange:'Close changes',
 manual:'Enter requests received on KakaoTalk here. Automatic intake is not connected.', search:'Search name',
 statusFilter:'Reservation status', active:'In progress', all:'All', loading:'Loading…', empty:'No reservations',
 selectBooking:'Select a reservation', confirmed:'Reservation confirmed.', changeWaiting:'Change awaiting approval',
 cancelWaiting:'Cancellation awaiting approval', cancelRequest:'Request cancellation', cancelRequested:'Cancellation requested',
 keepOriginal:'The existing reservation stays unchanged until approval.', cashierReply:'Cashier reply', alternative:'Alternative time',
 reply:'Reply / reason', replyHint:'Enter a short reply the desk can understand.', alternativeOptional:'Alternative time (optional)',
 approve:'Confirm', approveCancel:'Approve cancellation', reject:'Reject', suggest:'Suggest a change', checkIn:'Mark arrived',
 noShow:'Mark no-show', cancel:'Cancel reservation', settlement:'Receipt check',
 receiptHelp:'Buy-ins and amounts are recorded only from scanned receipts. Reservations and arrival checks do not create financial entries.',
 receiptCheck:'Check receipt records', checking:'Checking…', history:'Activity history', staff:'Staff', updated:'Last action',
 notifications:'Updates appear while this screen is open. Push notifications after closing the app are not available.',
 sheet:'Reservation sheet', sheetError:'Connection error', sheetPending:'Sync pending', sheetSynced:'Synced', sheetOff:'Not connected',
 sheetSeparate:'Managed separately from receipt accounting.', openSheet:'Open daily settlement sheet',
 openManagement:'Open game, account and Telegram settings', closeManagement:'Close settings', liveMode:'Go to live workspace', testMode:'Verification mode',
 table:'Table', gameNo:'Game No.', nextGame:'Next 5M game', testGame:'Test · 5M', saved:'Saved',
 submitted:'Sent to the cashier. Awaiting approval.', updateNotice:'Reservation updated',
 connectionError:'Connection failed. Please retry.', saveError:'Check the result, then retry. Retrying the same request will not create a duplicate.',
 submitError:'The request could not be confirmed.', receiptError:'Could not check receipt records. No changes were made.',
 unknownError:'Please refresh and try again.', staleError:'This reservation changed. Refresh and try again.',
 fullError:'There are not enough seats.', closedError:'This game is not available.', staffError:'Please sign in with the required staff account.',
 duplicateError:'An active reservation already exists for this player.', nameError:'Enter an English name using 2–80 letters.',
 timeError:'Check the arrival time.', guestsError:'Enter between 1 and 30 guests.', reasonError:'Enter a reason or alternative.',
 conflictError:'This request was already used. Refresh before making another change.', noteError:'Use no more than 500 characters.',
 statuses:{pending:'Waiting',confirmed:'Confirmed',waitlisted:'Awaiting adjustment',rejected:'Rejected',cancelled:'Cancelled',checked_in:'Arrived',no_show:'No-show'},
 actions:{request:'Reservation requested',request_change:'Change requested',request_cancel:'Cancellation requested',approve:'Approved',reject:'Rejected',suggest:'Alternative suggested',cancel:'Cancelled',check_in:'Arrival recorded',no_show:'No-show recorded',contact:'Contact desk'},
 receipt:{unassigned:'Assign a game before checking receipts.',multiple:'Multiple records found. Staff review required.',group:'A receipt record matches the lead guest. Check the other guests separately.',matched:'A receipt record matches the name and game. Attendance still needs confirmation.',none:'No matching record. This does not mean the guest did not arrive.'},
};
type Copy = {[K in keyof typeof en]: typeof en[K] extends string ? string : {[P in keyof typeof en[K]]:string}};
const ko:Copy = {
 desk:'한국인 데스크',cashier:'캐셔',guestPage:'손님 화면',logout:'로그아웃',test:'검증 전용',live:'실제 운영',
 testWarning:'검증 예약은 텔레그램과 정산시트로 전송되지 않습니다.',prepareTest:'검증 게임 준비',
 connected:'연결됨',disconnected:'연결 확인 필요',polling:'2초 간격 자동 확인',refresh:'다시 확인',
 pendingCount:'미처리',confirmedCount:'확정 인원',arrivedCount:'도착',add:'예약 등록',
 request:'예약 요청',changeRequest:'변경 요청',name:'이름 (영문)',game:'게임',choose:'선택',
 arrival:'도착 예정',arrivalVN:'도착 예정 (베트남 시간)',guests:'인원',people:'명',person:'명',note:'메모',
 saving:'저장 중…',submit:'예약 요청 보내기',submitChange:'변경 승인 요청',closeChange:'변경 닫기',
 manual:'카톡으로 받은 내용을 직접 입력하세요. 자동 수신은 연결되지 않았습니다.',search:'이름 검색',
 statusFilter:'예약 상태',active:'진행 중',all:'전체',loading:'불러오는 중…',empty:'예약이 없습니다',
 selectBooking:'예약을 선택하세요',confirmed:'예약이 확정되었습니다.',changeWaiting:'변경 승인 대기',
 cancelWaiting:'취소 승인 대기',cancelRequest:'취소 요청',cancelRequested:'취소를 요청했습니다',
 keepOriginal:'승인 전에는 기존 예약이 유지됩니다.',cashierReply:'캐셔 답변',alternative:'대안 시간',
 reply:'답변 / 사유',replyHint:'데스크가 이해할 수 있도록 간단히 적어주세요.',alternativeOptional:'대안 시간 (선택)',
 approve:'예약 확정',approveCancel:'취소 승인',reject:'거절',suggest:'조정 제안',checkIn:'도착 확인',
 noShow:'미방문 확인',cancel:'예약 취소',settlement:'영수증 대조',
 receiptHelp:'바이인·금액은 영수증 스캔으로만 기록합니다. 예약·도착 확인으로 금액을 만들지 않습니다.',
 receiptCheck:'영수증 정산 기록 확인',checking:'조회 중…',history:'처리 이력',staff:'직원',updated:'최근 처리',
 notifications:'이 화면에서 예약 변경을 자동으로 알려드립니다. 앱 종료 후 푸시 알림은 제공되지 않습니다.',
 sheet:'예약현황 시트',sheetError:'연결 오류',sheetPending:'반영 대기',sheetSynced:'동기화됨',sheetOff:'연결 준비 중',
 sheetSeparate:'영수증 정산과 별도 관리합니다.',openSheet:'일일정산시트 열기',
 openManagement:'게임·계정·텔레그램 관리 열기',closeManagement:'관리 닫기',liveMode:'실제 운영으로',testMode:'운영 검증 모드',
 table:'테이블',gameNo:'게임 번호',nextGame:'다음 5M 게임',testGame:'검증용 · 5M',saved:'저장되었습니다',
 submitted:'캐셔에게 요청했습니다. 아직 확정 전입니다.',updateNotice:'예약 업데이트',
 connectionError:'연결에 실패했습니다. 다시 시도하세요.',saveError:'저장 결과를 확인한 뒤 다시 시도하세요. 같은 작업을 재시도해도 중복되지 않습니다.',
 submitError:'요청을 확인하지 못했습니다.',receiptError:'영수증 기록을 조회하지 못했습니다. 변경된 내용은 없습니다.',
 unknownError:'새로고침 후 다시 시도하세요.',staleError:'예약 내용이 변경되었습니다. 다시 확인 후 처리하세요.',
 fullError:'예약 가능한 자리가 부족합니다.',closedError:'예약할 수 없는 게임입니다.',staffError:'필요한 직원 권한으로 로그인하세요.',
 duplicateError:'이 손님의 진행 중인 예약이 이미 있습니다.',nameError:'영문 이름을 2~80자로 입력하세요.',
 timeError:'도착 예정 시간을 확인하세요.',guestsError:'인원을 1~30명으로 입력하세요.',reasonError:'사유 또는 대안을 입력하세요.',
 conflictError:'이미 사용된 요청입니다. 다시 확인 후 변경하세요.',noteError:'500자 이내로 입력하세요.',
 statuses:{pending:'요청 중',confirmed:'확정',waitlisted:'조정 대기',rejected:'거절',cancelled:'취소',checked_in:'도착 확인',no_show:'미방문 확인'},
 actions:{request:'예약 요청',request_change:'변경 요청',request_cancel:'취소 요청',approve:'승인',reject:'거절',suggest:'대안 전달',cancel:'취소',check_in:'도착 확인',no_show:'미방문 확인',contact:'데스크 연락'},
 receipt:{unassigned:'게임 배정 후 영수증을 대조할 수 있습니다.',multiple:'복수 기록이 있습니다. 직원 확인이 필요합니다.',group:'대표자 정산 기록이 있습니다. 일행은 별도로 확인하세요.',matched:'동일 이름·게임의 정산 기록이 있습니다. 참가 여부는 확인이 필요합니다.',none:'일치 기록이 없습니다. 미방문으로 판정한 것은 아닙니다.'},
};
const vi:Copy = {
 desk:'Bàn Hàn Quốc',cashier:'Thu ngân',guestPage:'Trang khách',logout:'Đăng xuất',test:'Chỉ kiểm tra',live:'Đang vận hành',
 testWarning:'Đặt chỗ kiểm tra không được gửi đến Telegram hoặc bảng quyết toán.',prepareTest:'Tạo trò chơi kiểm tra',
 connected:'Đã kết nối',disconnected:'Kiểm tra kết nối',polling:'Tự kiểm tra mỗi 2 giây',refresh:'Làm mới',
 pendingCount:'Chờ duyệt',confirmedCount:'Số khách đã xác nhận',arrivedCount:'Đã đến',add:'Thêm đặt chỗ',
 request:'Yêu cầu đặt chỗ',changeRequest:'Yêu cầu sửa',name:'Tên bằng chữ cái tiếng Anh',game:'Trò chơi',choose:'Chọn',
 arrival:'Giờ đến',arrivalVN:'Giờ đến (giờ Việt Nam)',guests:'Số người',people:'người',person:'người',note:'Ghi chú',
 saving:'Đang lưu…',submit:'Gửi yêu cầu',submitChange:'Gửi yêu cầu sửa',closeChange:'Đóng chỉnh sửa',
 manual:'Nhập nội dung nhận qua KakaoTalk. Chưa kết nối nhận tự động.',search:'Tìm tên',
 statusFilter:'Trạng thái đặt chỗ',active:'Đang xử lý',all:'Tất cả',loading:'Đang tải…',empty:'Chưa có đặt chỗ',
 selectBooking:'Chọn đặt chỗ',confirmed:'Đặt chỗ đã được xác nhận.',changeWaiting:'Chờ duyệt sửa đổi',
 cancelWaiting:'Chờ duyệt hủy',cancelRequest:'Yêu cầu hủy',cancelRequested:'Đã yêu cầu hủy',
 keepOriginal:'Giữ nguyên đặt chỗ đến khi được duyệt.',cashierReply:'Phản hồi thu ngân',alternative:'Giờ đề xuất',
 reply:'Phản hồi / Lý do',replyHint:'Viết ngắn gọn để bàn Hàn Quốc hiểu.',alternativeOptional:'Giờ khác (tùy chọn)',
 approve:'Xác nhận',approveCancel:'Duyệt hủy',reject:'Từ chối',suggest:'Đề xuất điều chỉnh',checkIn:'Xác nhận đã đến',
 noShow:'Xác nhận không đến',cancel:'Hủy đặt chỗ',settlement:'Đối chiếu biên lai',
 receiptHelp:'Chỉ ghi nhận buy-in và số tiền từ ảnh biên lai. Đặt chỗ và xác nhận đã đến không tạo giao dịch.',
 receiptCheck:'Kiểm tra biên lai',checking:'Đang kiểm tra…',history:'Lịch sử xử lý',staff:'Nhân viên',updated:'Xử lý gần nhất',
 notifications:'Cập nhật tự động khi mở màn hình này. Chưa có thông báo đẩy khi đóng ứng dụng.',
 sheet:'Bảng đặt chỗ',sheetError:'Lỗi kết nối',sheetPending:'Đang chờ đồng bộ',sheetSynced:'Đã đồng bộ',sheetOff:'Chưa kết nối',
 sheetSeparate:'Quản lý riêng với quyết toán biên lai.',openSheet:'Mở bảng quyết toán ngày',
 openManagement:'Mở quản lý trò chơi, tài khoản và Telegram',closeManagement:'Đóng quản lý',liveMode:'Về giao diện vận hành',testMode:'Chế độ kiểm tra',
 table:'Bàn',gameNo:'Số game',nextGame:'Ván 5M tiếp theo',testGame:'Kiểm tra · 5M',saved:'Đã lưu',
 submitted:'Đã gửi thu ngân. Đang chờ duyệt.',updateNotice:'Đặt chỗ được cập nhật',
 connectionError:'Mất kết nối. Vui lòng thử lại.',saveError:'Kiểm tra kết quả rồi thử lại. Gửi lại cùng yêu cầu sẽ không tạo bản sao.',
 submitError:'Chưa xác minh được yêu cầu.',receiptError:'Không thể kiểm tra biên lai. Không có thay đổi nào.',
 unknownError:'Vui lòng làm mới rồi thử lại.',staleError:'Đặt chỗ đã thay đổi. Làm mới rồi thử lại.',
 fullError:'Không đủ chỗ trống.',closedError:'Không thể đặt trò chơi này.',staffError:'Đăng nhập bằng tài khoản nhân viên có quyền phù hợp.',
 duplicateError:'Khách này đã có đặt chỗ đang xử lý.',nameError:'Nhập tên bằng 2–80 chữ cái tiếng Anh.',
 timeError:'Kiểm tra giờ đến.',guestsError:'Nhập từ 1 đến 30 người.',reasonError:'Nhập lý do hoặc phương án khác.',
 conflictError:'Yêu cầu này đã được dùng. Làm mới trước khi sửa.',noteError:'Nhập tối đa 500 ký tự.',
 statuses:{pending:'Chờ duyệt',confirmed:'Đã xác nhận',waitlisted:'Chờ điều chỉnh',rejected:'Từ chối',cancelled:'Đã hủy',checked_in:'Đã đến',no_show:'Không đến'},
 actions:{request:'Yêu cầu đặt chỗ',request_change:'Yêu cầu sửa',request_cancel:'Yêu cầu hủy',approve:'Đã duyệt',reject:'Từ chối',suggest:'Đề xuất giờ khác',cancel:'Đã hủy',check_in:'Xác nhận đã đến',no_show:'Xác nhận không đến',contact:'Liên hệ quầy'},
 receipt:{unassigned:'Cần xếp trò chơi trước khi đối chiếu biên lai.',multiple:'Có nhiều bản ghi. Nhân viên cần kiểm tra.',group:'Có biên lai của khách đại diện. Kiểm tra những người đi cùng riêng.',matched:'Có bản ghi khớp tên và trò chơi. Vẫn cần xác nhận tham gia.',none:'Chưa có bản ghi khớp. Không có nghĩa là khách chưa đến.'},
};
export const reservationCopy:Record<ReservationLanguage,Copy>={ko,en,vi};
export type ReceiptEvidenceCode=keyof typeof en.receipt;
export function reservationError(message:string,lang:ReservationLanguage){
 const t=reservationCopy[lang];
 if(/Reservation changed|Reload and try|Refresh and try/i.test(message))return t.staleError;
 if(/Not enough seats|capacity/i.test(message))return t.fullError;
 if(/Game.*(closed|available|ended)/i.test(message))return t.closedError;
 if(/required.*staff|Staff.*required|Cashier approval|Administrator required|login required/i.test(message))return t.staffError;
 if(/active reservation already|duplicate/i.test(message))return t.duplicateError;
 if(/English name|Korean name/i.test(message))return t.nameError;
 if(/arrival time/i.test(message))return t.timeError;
 if(/Party size/i.test(message))return t.guestsError;
 if(/Reason or alternative/i.test(message))return t.reasonError;
 if(/Request ID/i.test(message))return t.conflictError;
 if(/too long/i.test(message))return t.noteError;
 return t.unknownError;
}

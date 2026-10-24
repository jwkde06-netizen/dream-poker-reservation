import type {SupabaseClient} from '@supabase/supabase-js';

export type StaffAuthIssue='credentials'|'network'|'rate'|'reset'|'managed'|'expired'|'mismatch'|'short';
export const staffAuthCopy={
 en:{cashier:'Cashier',desk:'Korean desk',title:'Staff sign in',id:'Username or email',password:'Password',show:'Show',hide:'Hide',signIn:'Sign in',working:'Please wait…',forgot:'Forgot password?',resetTitle:'Reset password',resetHelp:'Enter your username or email. We will send a reset link to the email registered to your account.',send:'Send reset link',back:'Back to sign in',sent:'If this account has a registered email, a reset link has been requested. Check your inbox and spam folder.',newPassword:'New password',repeat:'Repeat new password',save:'Save password',saved:'Password updated. Sign in with your new password.',credentials:'Username or password is incorrect. Check the spelling or reset your password.',network:'Could not connect. Check your connection and try again.',rate:'Too many attempts. Please wait a moment and try again.',reset:'Could not send the reset email. Please try again or contact your administrator.',managed:'This staff account does not have a delivery email. Ask the administrator to help you sign in.',expired:'The reset link is invalid or has expired. Request a new link.',mismatch:'The passwords do not match.',short:'Use at least 12 characters.'},
 ko:{cashier:'캐셔',desk:'한국인 데스크',title:'직원 로그인',id:'아이디 또는 이메일',password:'비밀번호',show:'보기',hide:'숨기기',signIn:'로그인',working:'처리 중…',forgot:'비밀번호를 잊으셨나요?',resetTitle:'비밀번호 재설정',resetHelp:'아이디 또는 이메일을 입력하세요. 계정에 등록된 이메일로 재설정 링크를 보냅니다.',send:'재설정 링크 보내기',back:'로그인으로 돌아가기',sent:'이메일이 등록된 계정이면 재설정 링크를 요청했습니다. 받은편지함과 스팸함을 확인하세요.',newPassword:'새 비밀번호',repeat:'새 비밀번호 확인',save:'비밀번호 저장',saved:'비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.',credentials:'아이디 또는 비밀번호가 맞지 않습니다. 입력 내용을 확인하거나 비밀번호를 재설정하세요.',network:'연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도하세요.',rate:'시도 횟수가 많습니다. 잠시 후 다시 시도하세요.',reset:'재설정 메일을 보내지 못했습니다. 다시 시도하거나 관리자에게 문의하세요.',managed:'메일을 받을 수 없는 직원 계정입니다. 관리자에게 로그인 지원을 요청하세요.',expired:'재설정 링크가 유효하지 않거나 만료되었습니다. 새 링크를 요청하세요.',mismatch:'비밀번호가 서로 다릅니다.',short:'12자 이상 입력하세요.'},
 vi:{cashier:'Thu ngân',desk:'Bàn Hàn Quốc',title:'Đăng nhập nhân viên',id:'Tên đăng nhập hoặc email',password:'Mật khẩu',show:'Hiện',hide:'Ẩn',signIn:'Đăng nhập',working:'Đang xử lý…',forgot:'Quên mật khẩu?',resetTitle:'Đặt lại mật khẩu',resetHelp:'Nhập tên đăng nhập hoặc email. Liên kết đặt lại sẽ được gửi đến email đã đăng ký.',send:'Gửi liên kết đặt lại',back:'Quay lại đăng nhập',sent:'Nếu tài khoản có email đã đăng ký, yêu cầu đặt lại đã được gửi. Kiểm tra hộp thư và thư rác.',newPassword:'Mật khẩu mới',repeat:'Nhập lại mật khẩu mới',save:'Lưu mật khẩu',saved:'Đã đổi mật khẩu. Đăng nhập bằng mật khẩu mới.',credentials:'Tên đăng nhập hoặc mật khẩu không đúng. Kiểm tra lại hoặc đặt lại mật khẩu.',network:'Không thể kết nối. Kiểm tra mạng và thử lại.',rate:'Quá nhiều lần thử. Vui lòng chờ rồi thử lại.',reset:'Không thể gửi email đặt lại. Thử lại hoặc liên hệ quản trị viên.',managed:'Tài khoản nhân viên này không có email nhận thư. Liên hệ quản trị viên để được hỗ trợ.',expired:'Liên kết không hợp lệ hoặc đã hết hạn. Yêu cầu liên kết mới.',mismatch:'Mật khẩu không khớp.',short:'Dùng ít nhất 12 ký tự.'}
} as const;

export function staffAuthIssue(error:unknown,fallback:StaffAuthIssue='network'):StaffAuthIssue{
 const e=error as {code?:string;status?:number;message?:string}|null;
 if(e?.code==='invalid_credentials'||/invalid login credentials/i.test(e?.message||''))return 'credentials';
 if(e?.status===429||/rate_limit|too many/i.test(e?.code||''))return 'rate';
 if(/expired|otp_expired|session_not_found/i.test(e?.code||''))return 'expired';
 return fallback;
}

// Keep usernames tied to the existing staff directory, including legacy admin accounts.
export async function resolveStaffEmail(client:SupabaseClient,identifier:string):Promise<string|null>{
 const value=identifier.trim().toLowerCase();
 if(value.includes('@'))return value;
 if(!value)return null;
 const {data,error}=await client.rpc('resolve_login_email',{p_username:value});
 if(error)throw error;
 return typeof data==='string'&&data?data:null;
}

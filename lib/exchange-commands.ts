import { ExchangeAccount, ExchangeIntent, ExchangeReview, toMinor, validateExchangeIntent } from './exchange-domain';

export const COMMAND_ONLY_GUIDE = '명령어로만 기록합니다. 일반 문장·사진은 반영하지 않았습니다.\n원화 추가: /krwin 금액\n원화 차감: /krwout 금액\n환전: /fx 받은금액 지급금액 (통화 필수)\n수수료: /fee 5 = 5만동\n조회: /status · 전체 사용법: /help\n이미 기록한 거래는 다시 입력하지 마세요.';
const moneySource='((?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\\.[0-9]+)?)\\s*(억|만|천)?\\s*(KRW|VND|USD|달러|원|동|불)';
type Money={account:ExchangeAccount;amount:string};
function readMoney(input:string,allowZero=false):{money:Money;rest:string}{
 const m=input.trimStart().match(new RegExp('^'+moneySource+'(?=\\s|$)','i'));
 if(!m)throw new ExchangeReview('금액마다 통화를 붙여주세요. 예: 315000원, 550만동, 100불. 숫자만 쓰거나 추정 금액은 기록하지 않습니다.');
 const [whole,fraction='']=m[1].replace(/,/g,'').split('.');
 if(whole.length>13||fraction.length>8)throw new ExchangeReview('금액을 확인해주세요.');
 const currency=m[3].toUpperCase(),account:ExchangeAccount=['KRW','원'].includes(currency)?'KRW_BANK':['VND','동'].includes(currency)?'VND_CASH':'USD_CASH';
 const factor=BigInt(({억:100000000,만:10000,천:1000} as Record<string,number>)[m[2]||'']||1);
 const scale=account==='USD_CASH'?BigInt(100):BigInt(1),divisor=BigInt('1'+'0'.repeat(fraction.length));
 const numerator=BigInt(whole+fraction)*factor*scale;
 if(numerator%divisor!==BigInt(0))throw new ExchangeReview('원·동은 정수, 달러는 센트까지 입력해주세요.');
 const minor=numerator/divisor;
 if(minor<BigInt(0)||(!allowZero&&minor===BigInt(0))||minor>BigInt(9000000000000))throw new ExchangeReview('금액 범위를 확인해주세요. 입출금은 0보다 커야 합니다.');
 const amount=account==='USD_CASH'?`${minor/BigInt(100)}.${String(minor%BigInt(100)).padStart(2,'0')}`:String(minor);
 toMinor(amount,account,allowZero);
 return {money:{account,amount},rest:input.trimStart().slice(m[0].length).trim()};
}
export function commandReference(text:string):{text:string;external_reference:string|null}{
 const m=text.trim().match(/\s+#([A-Za-z0-9][A-Za-z0-9._:-]{0,79})$/);
 return m?{text:text.trim().slice(0,-m[0].length).trim(),external_reference:m[1]}:{text:text.trim(),external_reference:null};
}
/** Fully explicit commands. First FX leg is received; second is paid. No inference/AI. */
export function explicitLedgerCommand(text:string):ExchangeIntent|null{
 const parsed=commandReference(text),match=parsed.text.match(/^\/(fx|in|out|expense|profit|loss|opening)(?:@\w+)?(?:\s+([\s\S]*))?$/i);
 if(!match)return null;
 const name=match[1].toLowerCase(),args=(match[2]||'').trim();
 if(!args)throw new ExchangeReview(name==='fx'?'/fx 받은금액 지급금액으로 입력해주세요. 예: /fx 315000원 550만동':'/'+name+' 금액과통화를 입력해주세요. /help에서 예시를 볼 수 있습니다.');
 if(name==='opening'){
  if(parsed.external_reference)throw new ExchangeReview('기초 시제에는 거래번호를 붙이지 않습니다. 미리보기 후 /confirm으로 확정해주세요.');
  let rest=args;const legs:Money[]=[];
  for(let i=0;i<3;i++){const part=readMoney(rest,true);legs.push(part.money);rest=part.rest;}
  if(rest||new Set(legs.map(x=>x.account)).size!==3)throw new ExchangeReview('/opening 동금액 원화금액 달러금액으로 세 통화를 한 번씩 입력해주세요. 없는 통화는 0입니다.');
  const balances={VND_CASH:'0',VND_BANK:'0',KRW_BANK:'0',KRW_CASH:'0',USD_CASH:'0'};
  for(const leg of legs)balances[leg.account]=leg.amount;
  return validateExchangeIntent({kind:'opening',balances,basis_vnd:{},note:'명시적 최초 시제 · 취득원가 미확인'});
 }
 const first=readMoney(args);
 if(name==='fx'){
  const second=readMoney(first.rest);let fee:null|{account:'VND_CASH';amount:string}=null;
  if(first.money.account===second.money.account)throw new ExchangeReview('환전은 받은 통화와 지급 통화가 달라야 합니다. 같은 통화의 이동은 기록하지 않았습니다.');
  if(second.rest){
   const label=second.rest.match(/^(?:수수료|fee)\s+([\s\S]+)$/i);
   if(!label)throw new ExchangeReview('별도로 받은 수수료만 뒤에 붙이세요. 예: /fx 315000원 550만동 수수료 5만동');
   const third=readMoney(label[1]);
   if(third.rest||third.money.account!=='VND_CASH')throw new ExchangeReview('수수료는 별도로 받은 동 금액 한 개만 입력해주세요.');
   fee={account:'VND_CASH',amount:third.money.amount};
  }
  return validateExchangeIntent({kind:'exchange',received:first.money,paid:second.money,fee,received_includes_fee:false,rate_vnd:null,
   note:'/fx · 앞 금액 수령, 뒤 금액 지급 · 수수료는 별도 수령액',external_reference:parsed.external_reference});
 }
 if(first.rest)throw new ExchangeReview('입출금 명령에는 금액 한 개만 입력해주세요. 거래번호는 끝에 #번호로 붙일 수 있습니다.');
 if(['expense','profit','loss'].includes(name)&&first.money.account!=='VND_CASH')throw new ExchangeReview('비용·수익·손실은 실제 동 금액으로 입력해주세요. 원화 원금은 수익이 아닙니다.');
 const category=name==='expense'?'expense':['profit','loss'].includes(name)?'fx_profit':'capital';
 const direction=['out','expense','loss'].includes(name)?'out':'in';
 return validateExchangeIntent({kind:'movement',...first.money,direction,category,basis_vnd:null,
  note:`/${name} · ${category==='capital'?'시제 보충·회수, 수익 제외':name==='expense'?'실제 비용':name==='loss'?'명시한 환전손실':'명시한 환전수익'}`,external_reference:parsed.external_reference});
}

/** Currency aliases and formatting differences do not create different retry identities. */
export function commandIntentKey(intent:ExchangeIntent):string|null{
 if(intent.kind==='movement')return ['movement',intent.account,toMinor(intent.amount,intent.account),intent.direction,intent.category].join(':');
 if(intent.kind==='exchange'&&intent.paid.amount!==null)return ['exchange',intent.received.account,toMinor(intent.received.amount,intent.received.account),intent.paid.account,toMinor(intent.paid.amount,intent.paid.account),intent.fee?.account||'',intent.fee?toMinor(intent.fee.amount,intent.fee.account):0].join(':');
 return null;
}

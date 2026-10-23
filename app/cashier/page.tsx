import ReservationApp from "../ReservationApp";
import DemoWorkspace from "../demo/DemoWorkspace";
export default function Page({searchParams}:{searchParams:{demo?:string}}){return searchParams.demo==="1"?<DemoWorkspace role="cashier"/>:<ReservationApp staffOnly/>}

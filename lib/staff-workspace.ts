export type StaffWorkspace="cashier"|"desk";
export function canAccessStaffWorkspace(profile:{role:string;active:boolean}|null,workspace:StaffWorkspace){
 return !!profile?.active && (["admin","staff"].includes(profile.role)||profile.role===workspace);
}

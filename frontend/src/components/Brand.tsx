import{HeartPulse}from'lucide-react';
export default function Brand({compact=false}:{compact?:boolean}){return <div className="brand"><span className="brand-icon"><HeartPulse size={23} strokeWidth={2.2}/></span>{!compact&&<span>my period <strong>kit</strong><small>INSIGHTS PORTAL</small></span>}</div>}

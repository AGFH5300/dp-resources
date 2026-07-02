'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Clock, Headphones, Shield, Star } from 'lucide-react';
import { BrandMark } from './brand-mark';

export function AppSidebar({ admin=false, mobile=false, onNavigate }:{admin?:boolean; mobile?:boolean; onNavigate?:()=>void}){
 const pathname=usePathname();
 const links=[{href:'/library',label:'Library',icon:BookOpen},{href:'/recent',label:'Recent',icon:Clock},{href:'/saved',label:'Saved',icon:Star},{href:'/support',label:'Support',icon:Headphones},...(admin?[{href:'/admin',label:'Admin',icon:Shield}]:[])];
 return <aside className={`${mobile?'w-full':'fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200 bg-[#f8fbff] md:block'}`} data-testid="app-sidebar">
  <div className="flex h-full flex-col px-3 py-4">
   <Link href="/library" onClick={onNavigate} className="mb-6 flex items-center gap-2 px-2 text-sm font-semibold tracking-tight text-[color:var(--dp-navy)]"><BrandMark className="size-8"/><span>DP Resources</span></Link>
   <nav className="space-y-1" aria-label="Primary navigation">{links.map(({href,label,icon:Icon})=>{const active=pathname===href||(href!=='/library'&&pathname?.startsWith(href)); return <Link key={href} href={href} onClick={onNavigate} className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${active?'bg-blue-50 text-[color:var(--dp-navy)]':'text-slate-600 hover:bg-slate-100 hover:text-[color:var(--dp-navy)]'}`}>{active&&<span className="absolute left-0 top-2 h-5 w-0.5 rounded bg-[color:var(--dp-blue)]"/>}<Icon className="size-4"/><span>{label}</span></Link>})}</nav>
  </div>
 </aside>
}

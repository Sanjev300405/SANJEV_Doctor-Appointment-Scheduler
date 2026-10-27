import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module, Controller, Get, Post, Patch, Body, Req, Res, HttpException, HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { Request, Response } from 'express';
import Database from 'better-sqlite3';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as fs from 'node:fs';
import * as path from 'node:path';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-deployment';
const dbDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'appointments.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('patient','doctor')),created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS doctors(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER UNIQUE,name TEXT NOT NULL,specialty TEXT NOT NULL,experience INTEGER NOT NULL,fee INTEGER NOT NULL,bio TEXT NOT NULL,avatar TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS slots(id INTEGER PRIMARY KEY AUTOINCREMENT,doctor_id INTEGER NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,booked INTEGER NOT NULL DEFAULT 0,UNIQUE(doctor_id,date,time),FOREIGN KEY(doctor_id) REFERENCES doctors(id));
CREATE TABLE IF NOT EXISTS appointments(id INTEGER PRIMARY KEY AUTOINCREMENT,patient_id INTEGER NOT NULL,doctor_id INTEGER NOT NULL,slot_id INTEGER NOT NULL UNIQUE,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'confirmed',created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(patient_id) REFERENCES users(id),FOREIGN KEY(doctor_id) REFERENCES doctors(id),FOREIGN KEY(slot_id) REFERENCES slots(id));
`);
const doctorCount = (db.prepare('SELECT COUNT(*) n FROM doctors').get() as any).n;
if (!doctorCount) {
  const doctors = [
    ['Dr. Ananya Raman','Cardiologist',12,700,'Heart health, preventive cardiology and patient-first care.','AR'],
    ['Dr. Karthik Iyer','Dermatologist',9,600,'Skin health, acne care and evidence-based treatment.','KI'],
    ['Dr. Meera Nair','General Physician',15,500,'Primary care, wellness checks and chronic condition support.','MN'],
    ['Dr. Rahul Menon','Orthopedic',11,650,'Joint, muscle and sports-injury consultations.','RM']
  ];
  const insertDoctor = db.prepare('INSERT INTO doctors(name,specialty,experience,fee,bio,avatar) VALUES(?,?,?,?,?,?)');
  const insertSlot = db.prepare('INSERT OR IGNORE INTO slots(doctor_id,date,time) VALUES(?,?,?)');
  const today = new Date();
  for (const d of doctors) {
    const result = insertDoctor.run(d[0],d[1],d[2],d[3],d[4],d[5]);
    for (let offset=1; offset<=7; offset++) {
      const day = new Date(today); day.setDate(today.getDate()+offset);
      const date = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
      for (const time of ['09:00','10:30','12:00','14:00','15:30']) insertSlot.run(result.lastInsertRowid,date,time);
    }
  }
}
function fail(status:number,message:string):never { throw new HttpException({message},status); }
function tokenFor(user:any) { return jwt.sign({sub:user.id,name:user.name,email:user.email,role:user.role},JWT_SECRET,{expiresIn:'7d'}); }
function auth(req:Request, role?:string) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) fail(401,'Please sign in first.');
  try { const user:any = jwt.verify(h.slice(7),JWT_SECRET); if (role && user.role !== role) fail(403,'This action is not allowed for your account.'); return user; }
  catch (e:any) { if (e instanceof HttpException) throw e; fail(401,'Your session expired. Please sign in again.'); }
}
@Controller()
class AppController implements OnModuleInit {
  onModuleInit() {}
  @Get('health') health() { return {status:'ok',service:'doctor-scheduler-api'}; }
  @Post('api/auth/register') register(@Body() b:any) {
    const name=String(b.name||'').trim(), email=String(b.email||'').trim().toLowerCase(), password=String(b.password||''), role=String(b.role||'patient');
    if(name.length<2 || !/^\S+@\S+\.\S+$/.test(email) || password.length<8 || !['patient','doctor'].includes(role)) fail(400,'Enter a name, valid email, password (8+ characters), and valid role.');
    if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) fail(409,'An account with this email already exists.');
    const info=db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run(name,email,bcrypt.hashSync(password,10),role);
    const user={id:Number(info.lastInsertRowid),name,email,role};
    if(role==='doctor') db.prepare('INSERT INTO doctors(user_id,name,specialty,experience,fee,bio,avatar) VALUES(?,?,?,?,?,?,?)').run(user.id,name,String(b.specialty||'General Physician'),Number(b.experience||1),Number(b.fee||500),String(b.bio||'Independent healthcare professional.'),name.split(/\s+/).slice(-1)[0].slice(0,2).toUpperCase());
    return {token:tokenFor(user),user};
  }
  @Post('api/auth/login') login(@Body() b:any) {
    const email=String(b.email||'').trim().toLowerCase(), password=String(b.password||'');
    const row:any=db.prepare('SELECT id,name,email,password_hash,role FROM users WHERE email=?').get(email);
    if(!row || !bcrypt.compareSync(password,row.password_hash)) fail(401,'Incorrect email or password.');
    const user={id:row.id,name:row.name,email:row.email,role:row.role}; return {token:tokenFor(user),user};
  }
  @Get('api/auth/me') me(@Req() req:Request) { const u=auth(req); return {user:{id:u.sub,name:u.name,email:u.email,role:u.role}}; }
  @Get('api/doctors') doctors(@Req() req:Request) {
    const q=String(req.query.q||'').trim();
    return db.prepare(`SELECT d.id,d.name,d.specialty,d.experience,d.fee,d.bio,d.avatar,COUNT(s.id) availableSlots FROM doctors d LEFT JOIN slots s ON s.doctor_id=d.id AND s.booked=0 AND s.date>=date('now','localtime') WHERE (?='' OR d.name LIKE ? OR d.specialty LIKE ?) GROUP BY d.id ORDER BY d.id`).all(q,`%${q}%`,`%${q}%`);
  }
  @Get('api/doctors/:id/slots') slots(@Req() req:Request) {
    const id=Number(req.params.id); if(!Number.isInteger(id)) fail(400,'Invalid doctor.');
    return db.prepare("SELECT id,date,time FROM slots WHERE doctor_id=? AND booked=0 AND date>=date('now','localtime') ORDER BY date,time").all(id);
  }
  @Post('api/appointments') book(@Req() req:Request,@Body() b:any) {
    const u=auth(req,'patient'), slotId=Number(b.slotId), reason=String(b.reason||'General consultation').trim().slice(0,300);
    if(!Number.isInteger(slotId)||slotId<1) fail(400,'Choose an available appointment slot.');
    const tx=db.transaction(()=>{
      const slot:any=db.prepare('SELECT * FROM slots WHERE id=?').get(slotId);
      if(!slot || slot.booked || slot.date < new Date().toISOString().slice(0,10)) fail(409,'This slot is no longer available. Please choose another.');
      db.prepare('UPDATE slots SET booked=1 WHERE id=? AND booked=0').run(slotId);
      const info=db.prepare("INSERT INTO appointments(patient_id,doctor_id,slot_id,reason,status) VALUES(?,?,?,?, 'confirmed')").run(u.sub,slot.doctor_id,slotId,reason||'General consultation');
      return Number(info.lastInsertRowid);
    });
    const id=tx(); return db.prepare('SELECT a.id,a.reason,a.status,s.date,s.time,d.id doctorId,d.name doctorName,d.specialty,d.fee FROM appointments a JOIN slots s ON s.id=a.slot_id JOIN doctors d ON d.id=a.doctor_id WHERE a.id=?').get(id);
  }
  @Get('api/appointments/mine') mine(@Req() req:Request) {
    const u=auth(req,'patient'); return db.prepare('SELECT a.id,a.reason,a.status,s.date,s.time,d.id doctorId,d.name doctorName,d.specialty,d.fee FROM appointments a JOIN slots s ON s.id=a.slot_id JOIN doctors d ON d.id=a.doctor_id WHERE a.patient_id=? ORDER BY s.date DESC,s.time DESC').all(u.sub);
  }
  @Get('api/appointments/doctor') doctorAppointments(@Req() req:Request) {
    const u=auth(req,'doctor'); return db.prepare('SELECT a.id,a.reason,a.status,s.date,s.time,p.name patientName,p.email patientEmail FROM appointments a JOIN slots s ON s.id=a.slot_id JOIN users p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id WHERE d.user_id=? ORDER BY s.date,s.time').all(u.sub);
  }
  @Patch('api/appointments/:id/status') updateStatus(@Req() req:Request,@Body() b:any) {
    const u=auth(req,'doctor'), id=Number(req.params.id), status=String(b.status||'');
    if(!['confirmed','completed','cancelled'].includes(status)) fail(400,'Invalid appointment status.');
    const ap:any=db.prepare('SELECT a.id,a.slot_id FROM appointments a JOIN doctors d ON d.id=a.doctor_id WHERE a.id=? AND d.user_id=?').get(id,u.sub);
    if(!ap) fail(404,'Appointment not found for this doctor.');
    const tx=db.transaction(()=>{db.prepare('UPDATE appointments SET status=? WHERE id=?').run(status,id); if(status==='cancelled') db.prepare('UPDATE slots SET booked=0 WHERE id=?').run(ap.slot_id); else if(status!=='cancelled') db.prepare('UPDATE slots SET booked=1 WHERE id=?').run(ap.slot_id);}); tx(); return {ok:true,id,status};
  }
}
@Module({controllers:[AppController]}) class AppModule {}
async function bootstrap(){ const app=await NestFactory.create(AppModule); app.enableCors({origin:process.env.CORS_ORIGIN?.split(',')||true,credentials:false}); app.setGlobalPrefix(''); const port=Number(process.env.PORT||3000); await app.listen(port,'0.0.0.0'); console.log(`Doctor Scheduler API running on ${port}`); }
bootstrap();

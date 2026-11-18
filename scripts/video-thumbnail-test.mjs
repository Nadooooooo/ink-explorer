import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {makeThumbnail} from '../server/media-cache.mjs';

const run=promisify(execFile);

test('ordinary MP4 with a trailing index produces a bounded WebP and cleans temporary inputs',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'ink-video-test-'));
  const previousTmp=process.env.TMPDIR;
  try {
    const video=path.join(directory,'ordinary.mp4'),scratch=path.join(directory,'scratch');await mkdir(scratch);
    await run('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=640x360:d=3','-c:v','libx264','-threads','1','-preset','ultrafast','-pix_fmt','yuv420p','-y',video],{timeout:10000});
    const body=await readFile(video);
    assert(body.indexOf('mdat')>=0);
    assert(body.indexOf('moov')>body.indexOf('mdat'),'Regression fixture must require backwards seeking');
    process.env.TMPDIR=scratch;
    const frame=await makeThumbnail(body);
    assert.equal(frame.toString('ascii',0,4),'RIFF');assert.equal(frame.toString('ascii',8,12),'WEBP');
    assert(frame.length>0&&frame.length<=2*1024*1024);
    assert.deepEqual(await readdir(scratch),[],'Successful decoding must remove its input');
    await assert.rejects(makeThumbnail(Buffer.from('invalid video')),/Thumbnail unavailable/);
    assert.deepEqual(await readdir(scratch),[],'Failed decoding must remove its input');
    // A local file reference disguised as an image must never become a playlist input.
    await assert.rejects(makeThumbnail(Buffer.from(`ffconcat version 1.0\nfile '${video}'\n`)),/Thumbnail unavailable/);
    assert.deepEqual(await readdir(scratch),[],'Rejected playlists must remove their input');
    const still=path.join(directory,'still.png');
    await run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=purple:s=160x90','-frames:v','1','-threads','1','-y',still],{timeout:10000});
    const image=await makeThumbnail(await readFile(still));
    assert.equal(image.toString('ascii',8,12),'WEBP','Still-image thumbnails remain supported');
    assert.deepEqual(await readdir(scratch),[]);
  } finally {
    if(previousTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=previousTmp;
    await rm(directory,{recursive:true,force:true});
  }
});

test('a stuck decoder is terminated at its deadline and removes its temporary input',{timeout:20000},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'ink-video-timeout-test-'));
  const previousTmp=process.env.TMPDIR,previousPath=process.env.PATH;
  try {
    const scratch=path.join(directory,'scratch');await mkdir(scratch);
    await writeFile(path.join(directory,'ffmpeg'),'#!/bin/sh\nexec /bin/sleep 60\n',{mode:0o700});
    process.env.TMPDIR=scratch;process.env.PATH=directory;
    await assert.rejects(makeThumbnail(Buffer.from('stalled decoder fixture')),/Thumbnail timeout/);
    assert.deepEqual(await readdir(scratch),[],'Timed-out decoding must remove its input after termination');
  } finally {
    if(previousTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=previousTmp;
    if(previousPath===undefined)delete process.env.PATH;else process.env.PATH=previousPath;
    await rm(directory,{recursive:true,force:true});
  }
});

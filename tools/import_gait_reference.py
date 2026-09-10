"""Fetch only the small processed files from the authors' CC BY 4.0 datasets.

The large walking archive is read with HTTP Range requests, not downloaded whole.
Raw input files and SHA256 provenance stay separate from retargeted animation data.
"""
from pathlib import Path
import concurrent.futures, hashlib, io, json, struct, urllib.request, zipfile, zlib

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets/reference/gait'
DEST.mkdir(parents=True, exist_ok=True)

def fetch(url):
    return urllib.request.urlopen(url, timeout=40).read()

class RemoteZip(io.RawIOBase):
    def __init__(self, url, size):
        self.url, self.size, self.pos = url, size, 0
    def seek(self, n, whence=0):
        self.pos = n if whence == 0 else self.pos+n if whence == 1 else self.size+n
        return self.pos
    def tell(self):
        return self.pos
    def read(self, n=-1):
        n = min(n if n >= 0 else self.size-self.pos, self.size-self.pos)
        if n <= 0: return b''
        req = urllib.request.Request(self.url, headers={'Range':f'bytes={self.pos}-{self.pos+n-1}'})
        with urllib.request.urlopen(req, timeout=40) as r:
            if r.status != 206: raise RuntimeError('Range not supported; refusing full archive download')
            b = r.read()
        self.pos += len(b)
        return b

def save(name, url, content=None):
    path = DEST/name
    if not path.exists(): path.write_bytes(fetch(url) if content is None else content)
    return {'name':name, 'url':url, 'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}

def main():
    sources=[]
    for aid in (5722711,4543435):
        p=DEST/f'figshare-{aid}.json'
        if not p.exists(): p.write_bytes(fetch(f'https://api.figshare.com/v2/articles/{aid}'))
        d=json.loads(p.read_text()); sources.append({'article':aid,'doi':d['doi'],'license':d['license'],'files':[]})
        if aid == 5722711:
            f=next(f for f in d['files'] if f['name']=='WBDSascii.zip')
            z=zipfile.ZipFile(RemoteZip(f['download_url'],f['size']))
            # All 42 subjects retained; age selection is performed from metadata.
            def member(i):
                name=f'WBDS{i:02}walkT05ang.txt'
                if (DEST/name).exists(): return save(name, f['download_url']+'#'+name)
                info=z.getinfo(name)
                r=RemoteZip(f['download_url'],f['size']);r.seek(info.header_offset)
                b=r.read(info.compress_size+4096)
                name_len, extra_len=struct.unpack_from('<HH',b,26)
                start=30+name_len+extra_len
                compressed=b[start:start+info.compress_size]
                data=zlib.decompress(compressed,-15) if info.compress_type==8 else compressed
                if zlib.crc32(data)!=info.CRC: raise RuntimeError('ZIP CRC mismatch '+name)
                return save(name, f['download_url']+'#'+name, data)
            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
                sources[-1]['files']+=list(ex.map(member,range(1,43)))
            f=[f for f in d['files'] if f['name']=='WBDSinfo.xlsx'][-1]
            sources[-1]['files'].append(save(f['name'],f['download_url']))
        else:
            fs=[f for f in d['files'] if f['name'].endswith('processed.txt') and int(f['name'][4:7])<=28]
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
                sources[-1]['files']+=list(ex.map(lambda f:save(f['name'],f['download_url']),fs))
            f=next(f for f in d['files'] if f['name']=='RBDSinfo.txt')
            sources[-1]['files'].append(save(f['name'],f['download_url']))
        print(aid, len(sources[-1]['files']), 'files retained',flush=True)
    (DEST/'provenance.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__': main()

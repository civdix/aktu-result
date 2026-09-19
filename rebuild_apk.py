import zipfile
import hashlib
import zlib
import os
import struct
import subprocess

src_apk = r'D:\Downloads\aktu-result-desk-v1.1.apk'
unsigned_apk = r'D:\New folder (3)\AKTU-DOB-FINDER\unsigned_temp.apk'
out_dir = r'D:\New folder (3)\AKTU-DOB-FINDER\public\apk'
final_apk_path = os.path.join(out_dir, 'AKTU-Result-v1.0.0.apk')
keystore = r'D:\New folder (3)\AKTU-DOB-FINDER\aktu-release.keystore'

print("Loading new 360x360 icon...")
with open('icon_360_rgba.png', 'rb') as f:
    new_icon_data = f.read()

# Copy icon for website landing page as well
with open('final_icon.png', 'rb') as fin, open(r'public\app-icon.png', 'wb') as fout:
    fout.write(fin.read())
print("Copied final_icon.png to public/app-icon.png!")

icon_files = [
    'res/8c.png', 'res/9w.png', 'res/FS.png', 'res/Gc.png', 'res/OY.png',
    'res/RJ.png', 'res/fO.png', 'res/o-.png', 'res/wb.png', 'res/yn.png', 'res/zR.png'
]

file_map = {}
with zipfile.ZipFile(src_apk, 'r') as zin:
    for item in zin.infolist():
        if item.filename.startswith('META-INF/'):
            continue
        data = zin.read(item.filename)
        file_map[item.filename] = (item, data)

# 1. Update AndroidManifest.xml
manifest = file_map['AndroidManifest.xml'][1]
manifest = manifest.replace('AKTU Result Desk'.encode('utf-16le'), 'AKTU Result Bond'.encode('utf-16le'))
manifest = manifest.replace('com.resultdesk.aktu'.encode('utf-16le'), 'com.akturesult.bond'.encode('utf-16le'))
file_map['AndroidManifest.xml'] = (file_map['AndroidManifest.xml'][0], manifest)
print("Updated AndroidManifest.xml with package com.akturesult.bond and label AKTU Result Bond!")

# 2. Update classes2.dex
dex2 = bytearray(file_map['classes2.dex'][1])
orig_len = len(dex2)

replacements = [
    (b'com.resultdesk.aktu', b'com.akturesult.bond'),
    (b'com/resultdesk/aktu', b'com/akturesult/bond'),
    (b'Lcom/resultdesk/aktu', b'Lcom/akturesult/bond'),
    (b'resultdesk', b'akturesult'),
    (b'Result Desk', b'Result Bond'),
    (b'QCheck your AKTU semester result fast without date of birth: https://akturesult.in',
     b'QCheck AKTU semester results online without date of birth: https://akturesult.bond'),
    (b'>Failed connecting to https://akturesult.in/api/app-status-v2: ',
     b'>Failed connecting to https://akturesult.bond/api/app-status/: '),
    (b'\x14akturesult.in/update', b'\x14akturesult.bond/apps'),
    (b"'https://akturesult.in/api/app-status-v2", b"'https://akturesult.bond/api/app-status/"),
    (b'"https://akturesult.in/chat-support', b'"https://akturesult.bond/tg-channel'),
    (b'\x1chttps://akturesult.in/update', b'\x1chttps://akturesult.bond/apps'),
    (b'&https://akturesult.in/whatsapp-channel', b'&https://akturesult.bond/whatsapp-alert'),
]

for old_b, new_b in replacements:
    assert len(old_b) == len(new_b), f"Length mismatch: {old_b} vs {new_b}"
    cnt = dex2.count(old_b)
    print(f"Replacing {old_b[:25]!r}: {cnt} times")
    dex2 = dex2.replace(old_b, new_b)

assert len(dex2) == orig_len, f"Length mismatch in dex2: {len(dex2)} vs {orig_len}"

sha1_hash = hashlib.sha1(dex2[32:]).digest()
dex2[12:32] = sha1_hash
adler_val = zlib.adler32(dex2[12:]) & 0xffffffff
dex2[8:12] = struct.pack('<I', adler_val)
file_map['classes2.dex'] = (file_map['classes2.dex'][0], bytes(dex2))
print("Recalculated classes2.dex checksums!")

# 3. Replace all 11 icon images with new custom icon
for icon_name in icon_files:
    item = file_map[icon_name][0]
    file_map[icon_name] = (item, new_icon_data)
print(f"Replaced {len(icon_files)} icon assets with custom AKTU Result Bond logo!")

# 4. Write unsigned APK
if os.path.exists(unsigned_apk):
    os.remove(unsigned_apk)

with zipfile.ZipFile(unsigned_apk, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
    for name, (info, data) in file_map.items():
        zout.writestr(name, data, compress_type=info.compress_type)

print(f"Wrote {unsigned_apk} ({os.path.getsize(unsigned_apk)} bytes)")

# 5. Sign with uber-apk-signer (zipalign + v1 + v2 + v3 signing)
cmd = [
    'java', '-jar', 'uber-apk-signer.jar',
    '-a', unsigned_apk,
    '--ks', keystore,
    '--ksAlias', 'aktubond',
    '--ksPass', 'android',
    '--ksKeyPass', 'android',
    '-o', out_dir,
    '--verbose'
]
print("Running uber-apk-signer for zipalign, v1, v2, and v3 signatures...")
res = subprocess.run(cmd, capture_output=True, text=True)
print("Signer exit code:", res.returncode)
print("Signer output:\n", res.stdout)
if res.stderr:
    print("Signer errors:\n", res.stderr)

# Check produced APK in out_dir
for f in os.listdir(out_dir):
    if f.endswith('.apk'):
        full = os.path.join(out_dir, f)
        print(f"Found APK in {out_dir}: {f} ({os.path.getsize(full)} bytes)")
        if f != 'AKTU-Result-v1.0.0.apk':
            os.replace(full, final_apk_path)
            print(f"Renamed {f} -> AKTU-Result-v1.0.0.apk")

if os.path.exists(unsigned_apk):
    os.remove(unsigned_apk)

print("APK Rebuild & Signing Complete!")

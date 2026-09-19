import zipfile
import hashlib
import zlib
import os
import subprocess
import struct

src_apk = r'D:\Downloads\aktu-result-desk-v1.1.apk'
out_apk = r'D:\New folder (3)\AKTU-DOB-FINDER\public\apk\AKTU-Result-v1.0.0.apk'
keystore = r'D:\New folder (3)\AKTU-DOB-FINDER\aktu-release.keystore'

print("Reading source APK...")
with zipfile.ZipFile(src_apk, 'r') as zin:
    file_map = {}
    for item in zin.infolist():
        if item.filename.startswith('META-INF/') and (item.filename.endswith('.SF') or item.filename.endswith('.RSA') or item.filename.endswith('.MF')):
            continue
        file_map[item.filename] = (item, zin.read(item.filename))

print(f"Total files to package: {len(file_map)}")

# 1. Patch AndroidManifest.xml
manifest = bytearray(file_map['AndroidManifest.xml'][1])
s_old = 'AKTU Result Desk'.encode('utf-16le')
s_new = 'AKTU Result Bond'.encode('utf-16le')
assert s_old in manifest, "AKTU Result Desk not found in manifest"
manifest = manifest.replace(s_old, s_new)
print("Patched AndroidManifest.xml successfully!")

# 2. Patch classes2.dex
dex2 = bytearray(file_map['classes2.dex'][1])
orig_len = len(dex2)

replacements = [
    (b'QCheck your AKTU semester result fast without date of birth: https://akturesult.in',
     b'QCheck AKTU semester results online without date of birth: https://akturesult.bond'),
    (b'>Failed connecting to https://akturesult.in/api/app-status-v2: ',
     b'>Failed connecting to https://akturesult.bond/api/app-status/: '),
    (b'\x14akturesult.in/update',
     b'\x14akturesult.bond/apps'),
    (b"'https://akturesult.in/api/app-status-v2",
     b"'https://akturesult.bond/api/app-status/"),
    (b'"https://akturesult.in/chat-support',
     b'"https://akturesult.bond/tg-channel'),
    (b'\x1chttps://akturesult.in/update',
     b'\x1chttps://akturesult.bond/apps'),
    (b'&https://akturesult.in/whatsapp-channel',
     b'&https://akturesult.bond/whatsapp-alert'),
    (b'Result Desk',
     b'Result Bond'),
]

for old_b, new_b in replacements:
    assert len(old_b) == len(new_b), f"Length mismatch: {len(old_b)} vs {len(new_b)}"
    count = dex2.count(old_b)
    print(f"Replacing {old_b[:30]!r}: found {count} times")
    dex2 = dex2.replace(old_b, new_b)

assert len(dex2) == orig_len, f"Length changed: {orig_len} to {len(dex2)}"

# Recalculate DEX SHA-1 and Adler32
sha1_hash = hashlib.sha1(dex2[32:]).digest()
dex2[12:32] = sha1_hash
adler_val = zlib.adler32(dex2[12:]) & 0xffffffff
dex2[8:12] = struct.pack('<I', adler_val)
print("Recalculated classes2.dex checksums successfully!")

file_map['AndroidManifest.xml'] = (file_map['AndroidManifest.xml'][0], bytes(manifest))
file_map['classes2.dex'] = (file_map['classes2.dex'][0], bytes(dex2))

# 3. Write new APK
os.makedirs(os.path.dirname(out_apk), exist_ok=True)
if os.path.exists(out_apk):
    os.remove(out_apk)

with zipfile.ZipFile(out_apk, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
    for name, (info, data) in file_map.items():
        compress = info.compress_type
        zout.writestr(name, data, compress_type=compress)

print(f"Wrote {out_apk}, size: {os.path.getsize(out_apk)} bytes")

# 4. Sign APK
res = subprocess.run([
    'jarsigner',
    '-sigalg', 'SHA256withRSA',
    '-digestalg', 'SHA-256',
    '-keystore', keystore,
    '-storepass', 'android',
    '-keypass', 'android',
    out_apk,
    'aktubond'
], capture_output=True, text=True)
print("Sign returncode:", res.returncode)
print("Sign stdout:", res.stdout[:300])
if res.stderr:
    print("Sign stderr:", res.stderr)

# 5. Verify signature
res_v = subprocess.run(['jarsigner', '-verify', out_apk], capture_output=True, text=True)
print("Verify stdout:", res_v.stdout)

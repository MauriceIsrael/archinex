#!/usr/bin/env python3
"""
Seed script for Nautobot 2.x - Archinex Telco-Cloud Environment
Idempotent creation of inventory required by EDP & Sylva CAPI:
- Location / Site: pop-valmondois
- Role: telco-baremetal-worker
- Device: srv-telco-bm-01 (Status: Planned)
- Interface: bmc (Type: other / 1000base-t)
- Prefix: 192.0.2.0/24
- IP: 192.0.2.10/24 (RFC 5737 TEST-NET-1) assigned to bmc interface
"""

import os
import sys

# Initialisation Django pour exécution autonome
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "nautobot.core.settings")
try:
    import django
    django.setup()
except Exception as e:
    print(f"[ERROR] Failed to initialize Django: {e}")
    sys.exit(1)

from django.contrib.contenttypes.models import ContentType
from nautobot.dcim.models import Device, DeviceType, Interface, Location, LocationType, Manufacturer
from nautobot.extras.models import Role, Status
from nautobot.ipam.models import IPAddress, Namespace, Prefix

def seed():
    print(">>> [ARCHINEX-SEED] Seeding Nautobot 2.x Telco Inventory...")

    # 1. Location Type & Location (pop-valmondois)
    loc_type, _ = LocationType.objects.get_or_create(
        name="Site",
        defaults={"description": "Standard Telco POP Location"}
    )
    status_active = Status.objects.get(name="Active")
    status_planned = Status.objects.get(name="Planned")

    location, created = Location.objects.get_or_create(
        name="pop-valmondois",
        defaults={
            "location_type": loc_type,
            "status": status_active,
            "description": "Telco Edge Point of Presence - Valmondois",
        }
    )
    print(f"  * Location 'pop-valmondois': {'created' if created else 'already exists'}")

    # 2. Manufacturer & DeviceType
    mfr, _ = Manufacturer.objects.get_or_create(
        name="Dell",
        defaults={"description": "Dell Technologies"}
    )
    dev_type, _ = DeviceType.objects.get_or_create(
        manufacturer=mfr,
        model="PowerEdge R750",
        defaults={"part_number": "R750-TELCO-SPEC"}
    )
    print("  * Manufacturer Dell & DeviceType PowerEdge R750 verified")

    # 3. Role: telco-baremetal-worker
    device_ct = ContentType.objects.get_for_model(Device)
    role, created = Role.objects.get_or_create(
        name="telco-baremetal-worker",
        defaults={"description": "BareMetal worker node for Telco Cloud CAPI / Sylva"}
    )
    if not role.content_types.filter(pk=device_ct.pk).exists():
        role.content_types.add(device_ct)
    print(f"  * Role 'telco-baremetal-worker': {'created' if created else 'already exists'}")

    # 4. Device: srv-telco-bm-01
    device, created = Device.objects.get_or_create(
        name="srv-telco-bm-01",
        defaults={
            "device_type": dev_type,
            "role": role,
            "location": location,
            "status": status_planned,
            "comments": "Telco Baremetal Host planned for Sylva User-Plane CAPI cluster"
        }
    )
    device.status = status_planned
    device.role = role
    device.location = location
    device.save()
    print(f"  * Device 'srv-telco-bm-01' (status=Planned): {'created' if created else 'updated'}")

    # 5. Interface: bmc
    iface, created = Interface.objects.get_or_create(
        device=device,
        name="bmc",
        defaults={
            "type": "other",
            "mgmt_only": True,
            "status": status_active,
            "description": "Baseboard Management Controller (Redfish / iDRAC)"
        }
    )
    print(f"  * Interface 'bmc' on srv-telco-bm-01: {'created' if created else 'already exists'}")

    # 6. Prefix & IP Address: 192.0.2.10/24 (RFC 5737)
    namespace = Namespace.objects.first()
    prefix, _ = Prefix.objects.get_or_create(
        prefix="192.0.2.0/24",
        defaults={
            "status": status_active,
            "namespace": namespace,
            "description": "RFC 5737 TEST-NET-1 for Telco Edge"
        }
    )
    ip_addr, created = IPAddress.objects.get_or_create(
        address="192.0.2.10/24",
        defaults={
            "status": status_active,
            "parent": prefix,
            "description": "OOB Management BMC IP for srv-telco-bm-01"
        }
    )
    iface.ip_addresses.add(ip_addr)
    print(f"  * IPAddress 192.0.2.10/24 assigned to 'bmc': {'created' if created else 'attached'}")

    print(">>> [ARCHINEX-SEED] Nautobot seeding completed successfully.")

if __name__ == "__main__":
    seed()

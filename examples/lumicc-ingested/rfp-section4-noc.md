# LUMICC Statement of Work – Lot 1 (Q2 2026)
## Section 4: Network Operation Centre (NOC)

Source: Le Gouvernement du Grand-Duché de Luxembourg - Ministère d'État – Service connectivités radio critiques
Programme to supply and operate the Next-Generation broadband PPDR network in Luxembourg (‘LUMICC’)

---

### 4. Network operation centre - NOC

#### 4.1 Overview of network operations
The Network operation centre is the central entity for telecom management of the LUMICC System, including both the core network and management infrastructure, the RANs and User equipment, and the interface to the fallback Coverage (Lot 3) and Adjacent systems.

- **REQ-Lot1-191 NOC shall be dedicated to LUMICC operations (C) 1000**
  The NOC shall be dedicated to LUMICC operations and shall not be shared with the MNO own NOC.

- **REQ-Lot1-192 Network operations – NOC (C) 1000**
  The LUMICC Network operator shall establish and operate a fully operational high availability and geo-redundant Mission-Critical Network Operations Centre capable of monitoring, operating, and maintaining a Mission critical LTE/5G network, together with its specific services, on a 24×7 basis, primary + backup (refer to RAMS chapter for availability requirement).

- **REQ-Lot1-193 NOC and QCI/5QI (C/COM) 250**
  The NOC shall manage QCIs/5QIs (including especially QCI/5QI 6, 7, 8 and Mission critical standardized QCIs/5QIs) to QoS characteristics mapping.

- **REQ-Lot1-194 NOC and Operator defined QCI/5QI (C/COM) 250**
  The NOC shall create and manage operator defined QCIs/5QIs (range 128-254, as per 3GPP TS 29.212).

- **REQ-Lot1-195 Operator defined “aerial 5QI” (C/COM) 250**
  The NOC shall be able to create an operator defined “aerial 5QI”, with a specific priority and specific packet delay budget and packet error rate attributes, optimised for traffic steering vis-à-vis some deployable solutions attached to GOV/AGA RANs solutions and for live uplink streaming from UAVs.

- **REQ-Lot1-196 Network automation (C) 1000**
  Network automation shall be embedded into the core network and management infrastructure, so as to minimise staffing needs.

- **REQ-Lot1-197 MDA framework for network analytics (C/COM/EXP) 1000**
  LUMICC network operations shall comply with [3GPP MDA] management data analytics functions for network and services management and orchestration, for both the core network domain and the RANs domain.

- **REQ-Lot1-198 Network functions (C) 50**
  The following network functions shall be operated from NOC.

---

#### 4.2 Monitoring & Supervision

- **REQ-Lot1-199 Monitoring and supervision (C) 1000**
  The NOC Solution shall provide real time monitoring and supervision through customizable dashboards.

- **REQ-Lot1-200 RANs monitoring (C/COM) 50**
  The NOC Solution shall have access to all information necessary to supervise and assess radio Coverage and radio network performance, including relevant KPIs and indicators required to evaluate the delivered Quality of Service (QoS) of Lot2 RAN, as well as Base station status and KPIs, Coverage indicators and radio quality metrics, radio performance (throughput, utilization, handover success rate). The LUMICC Network operator shall indicate if monitoring of MNO shared RAN shall be covered.

- **REQ-Lot1-201 Integration and supervision of RAN equipment from multiple suppliers (C) 250**
  The RAN management framework shall support RAN equipment from multiple suppliers.

- **REQ-Lot1-202 Core network monitoring (C) 250**
  The NOC Solution shall provide monitoring of the Core network, covering faults, performance of LUMICC System and services, with ITSM integration for Incident management.

- **REQ-Lot1-203 Transmission network monitoring (C) 50**
  The NOC Solution shall provide End-to-end monitoring of the transmission networks, including management links, backhaul and backbone transport links, connectivity between servers, service platforms, Adjacent systems, with performance visibility (health, path availability).

- **REQ-Lot1-204 Mission critical services monitoring (C) 50**
  The NOC Solution shall provide monitoring of MCX through real time fault and event collection.

- **REQ-Lot1-205 Infrastructure & facilities monitoring (C) 50**
  The NOC Solution shall provide monitoring of IT infrastructure, power systems, HVAC and site access across all sites, shared MNO elements and site sharing infrastructure.

- **REQ-Lot1-206 NOC operation regarding the MNO shared RAN service availability (C) 50**
  The LUMICC Network operator should not disable the MNO shared RAN service while the commercial MNO service is still enabled in the same area. This is to avoid the following situation: if a person under arrest or the general public can initiate a call with his private smartphone served by an MNO commercial subscription (from the same MNO as in Lot 2), then the nearby policeman shall be able to have a mission-critical call to his colleagues with his Device and LUMICC Subscription, either from the GOV RAN or from the MNO shared RAN.

- **REQ-Lot1-207 NOC optimisation regarding energy savings (C) 50**
  NOC operations shall optimise and save the energy needed the Network elements, including especially RANs.

- **REQ-Lot1-208 NOC optimisation regarding traffic (C) 50**
  NOC operations shall optimise the traffic, with load balancing and traffic steering and mobility optimisation.

- **REQ-Lot1-209 NOC decision support to trigger the use of a cell-on-wheels or a deployable solutions**
  Traffic peak may occur sporadically at a spot where an emergency event occurs. Traffic peak may occur at planned events. What decision support is included in the NOC to automatically suggest the use of an MNO cell on wheels (serving MNO shared RAN) or a deployable system (serving GOV RAN), in such circumstances?

---

#### 4.3 Event & Alarm Management

- **REQ-Lot1-210 Real time collection (C) 1000**
  The NOC Solution shall have the capabilities to handle real-time collection of alarms, events and relevant performance counters and logs from LUMICC System (RAN, Core, transmission, MCX, infrastructure).

- **REQ-Lot1-211 Multi-supplier O&M and event & alarm interpretation (C/COM) 1000**
  Events & alarms shall be interpreted according to the specification from the supplier of the related network element, avoiding misinterpretations due to multiple suppliers for Assets listed in LUMICC Inventory of assets.

- **REQ-Lot1-212 Alarm management (C/COM) 250**
  LUMICC Network operator shall indicate how the NOC avoids the following scenarios: a large number of alarms overwhelms key fault information; a large number of false alarms exist without any service impact; delayed root cause analysis and mitigation.

- **REQ-Lot1-213 NOC connected to a Syslog aggregator (C) 1000**
  A syslog aggregator, protected in a Bastion of the INFRA, shall be the recipient of event logs originating from all Network elements listed in LUMICC Inventory of assets, for further analysis by the NOC and the SOC/SIEM.

- **REQ-Lot1-214 Aggregation and correlation (C) 50**
  The NOC Solution shall implement aggregation and correlation of events and alarms across LUMICC System, with noise reduction (deduplication, suppression, customizable filters), alarm enrichment with topology, geo-location, affected services and Service areas.

- **REQ-Lot1-215 Automatic root cause analysis (C) 50**
  The NOC Solution shall perform automatic preliminary root cause analysis (RCA) to accelerate restoration and provide support for Maintenance windows to suppress expected alarms.

- **REQ-Lot1-216 Automated Incident creation (C) 50**
  The NOC solution shall provide the functionality of automatic Incident ticket creation/update in the ITSM platform, based on predefined alarm rules, severity, correlation results.

---

#### 4.4 Service Assurance & Active Probes

- **REQ-Lot1-217 Service assurance & active probes (C/COM/EXP) 1000**
  The NOC solution shall include configurable probes for End-to-end service validation for MCPTT, MC-Video, MC-Data, which shall support configurable run frequency (e.g., 30s–5 min), configurable protocols (SIP OPTIONS (MCPTT), RTP/RTCP (MC-Video), HTTP/REST (MC-Data)). The KPIs shall be recorded for evaluation (call setup success, media path latency, floor control bounded latency, jitter, packet loss, service availability). Please detail your approach.

- **REQ-Lot1-218 GOV RAN QoS monitoring (C) 50**
  LUMICC Network operator shall monitor the quality of service of the GOV RAN.

- **REQ-Lot1-219 KPIs for radio measurement under the RAN Coverage (C/COM/EXP) 250**
  In support of the KPI reports that he has to deliver to the Contracting authority, the LUMICC Network operator shall indicate how to measure RAN performance and Coverage through the use of specific probing solutions and test automation from network up to Devices. The LUMICC Network operator shall monitor at least the following MCX key performance indicators:
  - KPI1: MCPTT access time in a cell,
  - KPI2: End-to-end MCPTT access time,
  - KPI3: Mouth-to-ear latency,
  - KPI4: MCX late entry time,
  - KPI5: Perceived voice quality as per ITU-T P.863.

- **REQ-Lot1-220 MCPTT audio quality and responsiveness KPI targets (C) 250**
  With references to Audio MCPTT call performance as specified in 3GPP TS 22.179, probing results shall be compared to the following targets and a Non-conformity shall be ticketed if not met:
  - KPI1: MCPTT access time in a cell below 300 ms as per [R-6.15.3.2-012a] and [R-6.15.3.2-013]
  - KPI2: End-to-end MCPTT access time below 1000 ms as per [R-6.15.3.2-014] and [R-6.15.3.2-020]
  - KPI3: Mouth-to-ear latency below 300 ms as per [R-6.15.3.2-015]
  - KPI4: MCX Late entry time below 350 ms as per [R-6.15.4.2-004] and [R-6.15.4.2-005]
  - KPI5: MCPTT listening quality objective above 4.0

- **REQ-Lot1-221 PPDR handover success rate KPI6 (C/COM) 250**
  KPI6 is the percentage of handover attempts that result in successful and stable attachment to the target cell; bearer service interruption maximum time due to handover execution below 150 ms; bearer service reestablishment with QCI/5QI fulfilment; no radio link failure within 3000 ms after handover completion, compared to the total number of requested handovers. KPI6 target shall be above 99%.

- **REQ-Lot1-222 FRMCS handover success rate KPI7 (C/COM) 250**
  The handover success rate is a key performance indicator for FRMCS special devices in medium-mobility-state and high-mobility-state as defined in 3GPP TS 38.304, § 5.2.4.30, in a corridor of the FRMCS RAN. KPI7 bearer service interruption maximum time below 50 ms.

---

#### 4.5 Radio countermeasures

- **REQ-Lot1-223 GNSS denial of service (C) 50**
  Clock synchronisation shall be sufficiently stable so that, upon GNSS service being denied, the core network and management infrastructure shall be operated as a normal service for more than 1 month.

- **REQ-Lot1-224 Passive monitoring of the radio channels as reported by UEs (C/COM/EXP) 250**
  The NOC shall perform network analytics based on UE procedure for reporting channel state information with interference measurements, including RSSI, RSRP, RSRQ, SINR. The NOC shall classify interferences and infer whether a sudden correlated change in the values from several UEs in the same area implies higher interference or potential occurrence of jamming.

- **REQ-Lot1-225 RAN monitoring of the radio channels (C/COM/EXP) 1000**
  The NOC shall have the capability to trigger cells in a RAN to monitor uplink wideband power in the band of the cell and detect peaks, monitor uplink power per physical resource block, calculate CQI, measure block error rate on radio links and infer potential occurrence of jamming.

- **REQ-Lot1-226 Radio jamming - detection and classification (C/COM/EXP) 1000**
  The NOC should have the capability to trigger radio spectrum scanning in the operated RANs, detect and classify interferers and jammers.

- **REQ-Lot1-227 Radio jamming - mitigation (C) 250**
  Should some radio frequencies in the operating band assigned for LUMICC service be jammed, the NOC shall adapt the operation so that the service shall still continue and serve all LUMICC User equipment.

- **REQ-Lot1-228 Anti-jamming countermeasures (C/COM/EXP) 1000**
  The LUMICC Network operator shall detail if/how anti-jamming countermeasures are implemented in the LUMICC System.

- **REQ-Lot1-229 Detection of rogue base stations and IMSI catcher (C/COM/EXP) 250**
  The LUMICC Network operator shall detail the Detection of rogue base stations and IMSI catcher countermeasures that are implemented in the LUMICC System.

- **REQ-Lot1-230 Radio site provision to facilitate the detection and tracking of UAV as a future option (C/COM/EXP) 250**
  The LUMICC Network operator shall make provisions to facilitate the support in the INFRA of an Integrated sensing and communication (ISAC) functionality (3GPP 38.765 ISAC - Release 20) from the GOV/AGA RANs, to be decided later by the Contracting authority.

---

#### 4.6 Visualization & Dashboards

- **REQ-Lot1-231 Traffic analytics at interfaces (C) 1000**
  The NOC shall extract traffic analytics information related to LUMICC Subscriptions and provide reports regarding traffic over GOV RAN per QCI/5QI, MNO shared RAN per QCI/5QI, EUCCS interface(s), Roaming interfaces.

- **REQ-Lot1-232 NOC own dashboard (C) 50**
  The NOC Solution shall provide a centralized operational dashboard that delivers real time visibility, historical analytics, and actionable insight into all LUMICC System and LUMICC Services (RAN, Core, Transmission, MCX, Infrastructure).

- **REQ-Lot1-233 Multi-supplier O&M and NOC dashboard (C) 50**
  NOC dashboards shall aggregate Assets listed in LUMICC Inventory of assets, that may be from multiple suppliers.

- **REQ-Lot1-234 Multi-supplier O&M and SLA monitoring (C) 50**
  KPI calculations and SLA monitoring shall aggregate measures related to Assets listed in LUMICC Inventory of assets, that may be from multiple suppliers.

- **REQ-Lot1-235 Key performance indicators on NOC own dashboard (C) 50**
  Key performance indicators such as “INFRA availability KPI”, “Lot 2 monthly QoE KPI" and Lot 3 “Roaming-pack service availability” of the past month and current month shall be permanently displayed on the NOC dashboard.

- **REQ-Lot1-236 Specifically detailed NOC Hypervisor dashboard for the control room of the Contracting authority (C/COM/EXP) 1000**
  The NOC Solution shall provide for the Contracting authority a customizable Hypervisor dashboard that enables real-time and historical trends visualization of the overall network and services health status.

- **REQ-Lot1-237 Dashboard for User organisations (C/COM/EXP) 1000**
  A Network health/status web-based dashboard shall be accessible for the User organisation in all CR and at least via the interface to CR to User organisation’s domains (without hardware) and via Stand-alone dispatcher positions.

- **REQ-Lot1-238 Visualisation, dashboard and Hypervisor in a Multi-supplier system (C) 250**
  The visualisation of the complete topology of LUMICC System and the visualisation of attributes of Network elements shall not be affected by the multi-supplier nature of the Assets in LUMICC System.

---

#### 4.7 NRM, EMS & NMS systems for network operation

- **REQ-Lot1-239 Network resource models for managed objects (C) 50**
  3GPP network resource models (NRM) shall be complied for managed objects within the INFRA and at the integration Reference points with the RANs.

- **REQ-Lot1-240 YANG for O&M interface (C) 1000**
  YANG/NETCONF protocol and YANG/RESTCONF protocol shall be supported at O&M interface.

- **REQ-Lot1-241 Element management system (C) 250**
  When a Network element does not support YANG format, an Element manager (EM) shall be integrated in the network management system (NMS).

- **REQ-Lot1-242 Multi-supplier assumption for RAN equipment (C) 1000**
  As LUMICC System includes many RANs (Lot 2 RANs with macro cells and in-building small cells, in-house RANs, Vehicular mounted relays, FRMCS RAN), a multi-supplier approach for network equipment shall be supported for operation and Maintenance.

- **REQ-Lot1-243 Multi-supplier O&M interface (C/COM) 1000**
  The NOC Solution shall include or integrate an O&M interface for YANG format protocols, for EM and NMS, supporting multisupplier RANs, Core network, backbone transmission network, Interworking functions, applicative servers (MDM/MCX/GIS), and Datacentre environments.

- **REQ-Lot1-244 Toolset integration (C) 50**
  Software tools used for ITSM functions, visualization dashboards, O&M interface shall support real-time data ingestion, historical data retention and provide standardized data export options.

- **REQ-Lot1-245 CMDB consistency (C) 50**
  Software tools used for ITSM functions shall ensure CMDB consistency with OSS Inventory by synchronizing data and relationships with OSS Inventory.

---

#### 4.8 OSS & SMO Functional Toolsets

- **REQ-Lot1-246 OSS with SMO and EMS (C) 1000**
  Operational Support System (OSS) shall be associated with a Service Management and Orchestration (SMO) layer and an Element Management System (EMS).

- **REQ-Lot1-247 SMO – Policy & intent engine (C) 1000**
  Within the SMO and NWDAF, a policy and intent engine shall act as an intelligent automation platform to assist for translation of high-level SLAs into network policies, configurations and workflows; automate policies; automate configurations of QoS rules; automate Non-conformity detection.

- **REQ-Lot1-248 Multi-supplier O&M and configuration of Network elements (C/COM) 250**
  It shall be possible to configure all Network elements from LUMICC Inventory of assets.

- **REQ-Lot1-249 Multi-supplier O&M and OSS mediation layer (C) 1000**
  In a multi-supplier environment, consistent KPI semantics for performance monitoring and a normalised taxonomy for event and alarm management shall be assured in an OSS mediation layer, by translating proprietary counters from suppliers into a unified network resource model (NRM) for NOC analytics and dashboards.

- **REQ-Lot1-250 O&M versus the MNO shared RAN (C/COM) 1000**
  In a MOCN shared RAN architecture as applicable in Lot 2, the INFRA shall adapt to the interface exposed through the MNO’s own OSS/ENM layer, typically using REST APIs (JSON) such as YANG/RESTCONF, YANG/NETCONF, streaming pipelines (e.g., Kafka), Syslog, SNMP or XML/CSV over SFTP to deliver KPIs, events and alarms, and performance data applicable to LUMICC radio access service.

- **REQ-Lot1-251 O&M versus dedicated RANs (C) 50**
  Regarding the LUMICC dedicated RANs, such as GOV RAN, AGA RAN, FRMCS RAN and in-house RANs, the INFRA shall adapt to the multi-supplier nature of these RANs.

- **REQ-Lot1-252 Network resource model versus GOV/AGA RANs (C) 250**
  A network resource model (NRM) shall define network architecture between INFRA and RANs, RAN assets in inventory, cell configuration, performance monitoring, alarm reception.

- **REQ-Lot1-253 Network resource model versus the MNO shared RAN (C) 250**
  A network resource model (NRM) shall define MOCN architecture between INFRA and MNO shared RAN, shared resources, exclusive LUMICC resources, cell configuration, performance monitoring, alarm reception.

- **REQ-Lot1-254 YANG/NETCONF/RESTCONF protocol (C/COM) 1000**
  YANG/NETCONF/SSH protocol or YANG/RESTCONF/HTTP/TLS protocol should be used between the INFRA and the RANs for automated collection of performance metrics, SLA monitoring, alarm management, configuration, availability, audit.

- **REQ-Lot1-255 Fault management system (FMS) (C) 250**
  The NOC solution shall include a fault management system for collecting and storing real-time events & alarms (using YANG format as the preferred format, otherwise using SNMPv3 or Syslog).

- **REQ-Lot1-256 Conversion to syslog format (C) 250**
  Alarms and events should be converted into the syslog format and sent to a syslog aggregator connected to the NOC and SOC/SIEM.

- **REQ-Lot1-257 NOC alarm (C) 50**
  The NOC solution shall provide an alarm console interface for displaying enriched, correlated alarms from LUMICC System.

- **REQ-Lot1-258 Alarm console (C) 50**
  The alarm console shall allow NOC operator to acknowledge alarms, add annotations, browse historical alarms and apply filters.

- **REQ-Lot1-259 Alarm and context (C) 50**
  The alarm console shall provide context action to support automated Incident ticket creation from a selected alarm.

- **REQ-Lot1-260 Performance management system (PMS) (C) 250**
  PMS shall collect KPIs from Lot 2 RAN, Core, transmission subsystems, MCX services, IT infrastructure, and shall provide real-time and historical dashboards, trend analysis and playback, SLA monitoring with thresholds, policy driven alerts, predictive analytics.

- **REQ-Lot1-261 Configuration management system (CMS) (C) 250**
  CMS system shall ensure configuration backup and versioning, pre/post change snapshots, drift detection against baselines, firmware/software version tracking.

- **REQ-Lot1-262 Topology management (C) 50**
  CMS system shall maintain comprehensive physical and logical inventory of sites, equipment, logical functions, service chains, and service dependencies and perform auto discovery and reconciliation of Network elements using multiprotocol collectors. Auto-discovery shall not automatically apply configuration changes without authorization through Change management function.

- **REQ-Lot1-263 Automation & orchestration (C) 1000**
  The OSS system shall support automation and orchestration capabilities providing runbooks and playbooks for repeatable NOC operational actions (e.g., site outage workflows). The solution shall support event driven automation and closed loop remediation with operator approval options.

- **REQ-Lot1-264 Log management & observability (C) 50**
  The OSS system shall support log management capabilities, Syslog ingestion and parsing, log indexing/search and correlate log information with alarms and KPIs. Observation counters to check QoS enforcement, measure latency bounds, detect packet loss rate.

- **REQ-Lot1-265 Reporting & analytics (C) 50**
  The OSS system shall generate scheduled and ad-hoc SLA/KPI/Incident reports with export options: PDF, CSV, JSON, reporting APIs.

---

#### 4.9 Service Management Functional Toolsets

- **REQ-Lot1-266 IT service management (Incident, problem, Change management) (C) 1000**
  The NOC solution shall rely on the Back-office to support ITIL-aligned Incident, Problem, and Change management workflows. SLA timers, escalation tracking, MTTA/MTTR, integration with ITSM platform.

- **REQ-Lot1-267 Field support management (C) 50**
  The NOC solution shall support crew scheduling and dispatch, based on technology, fault type, priority, and geographic location, with GNSS-based check-in, ETR updates, sync with ITSM.

- **REQ-Lot1-268 High availability & Disaster recovery (C) 50**
  The NOC solution shall eliminate single points of failure across application, database and data collection layers. Support active or rapid failover high availability architectures.

---

#### 4.10 IT Infrastructure Requirements

- **REQ-Lot1-269 Secure infrastructure for the NOC (C) 50**
  Deployed on secure, resilient, and scalable infrastructure with redundant power supplies and hardware (no SPOF). Automated backup of configuration, inventory and operational data. RBAC, MFA, least-privilege, audit logging.

- **REQ-Lot1-270 Network connectivity (C) 50**
  Redundant WAN links with automatic failover and diverse physical paths.

- **REQ-Lot1-271 High availability (C) 50**
  Active-active or active-standby application architecture with no single point of failure across compute, storage, and network. DR procedures tested.

---

#### 4.11 NOC Premises Requirements

- **REQ-Lot1-272 General requirements on NOC premises (C) 50**
  Secure, ergonomic, resilient for 24/7 operations.

- **REQ-Lot1-273 Room layout & ergonomics (C) 50**
  Clear visibility of video wall from operator desks. Space for Tier-1, Tier-2, supervisory roles.

- **REQ-Lot1-274 Video wall (C) 50**
  High-resolution wall for dashboards, alarms, geo-maps.

- **REQ-Lot1-275 Operator desks (C) 50**
  Adjustable height, monitor mounts, cable management, sufficient power/network outlets.

- **REQ-Lot1-276 NOC communications (C) 50**
  Dedicated telephony lines for escalation, integration with collaboration platforms (Teams), internal intercom.

- **REQ-Lot1-277 Redundancy & environment controls (C) 50**
  Power backup (batteries + generator with target autonomy > 72 hours), HVAC, physical security (badge/biometrics, CCTV, visitor logging).

---

#### 4.12 NOC lay-out

- **REQ-Lot1-278 Management positions for NOC (C) 50**
  Desktop computers with large screens, browser, MDM agent, EDR agent (not accessible to NOC manager), connections to core network and INFRA servers.

- **REQ-Lot1-279 NOC Hypervisor (C) 50**
  Wall-mounted display screen displaying coverage maps, technical synopsis, traffic dashboard, Incident KPIs, performance dashboards.

- **REQ-Lot1-280 Network router and ancillary equipment (C) 50**
  Router, cables connecting management positions and Hypervisor to core network and INFRA servers.

- **REQ-Lot1-281 Lay-out of the NOC room (C/COM/EXP) 50**
  Tenderer proposal for NOC room layout.

- **REQ-Lot1-282 NOC back-up room for business continuity (C/COM/EXP) 50**
  Tenderer proposal for backup NOC room layout in case primary room is unavailable, isolated or unreachable.

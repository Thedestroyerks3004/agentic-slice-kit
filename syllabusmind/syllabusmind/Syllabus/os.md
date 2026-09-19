UNIT I INTRODUCTION TO OPERATING SYSTEMS AND PROCESSES 9L, 6P
Introduction to OS – Operating System Operations – Operating System Services – User and Operating
System Interface – System Calls – Operating System Structures – Process Concept – Process
Scheduling – Context Switch – Operations on Processes – Inter-process Communication – IPC in Shared
Memory Systems – IPC in Message Passing Systems – Examples of IPC Systems.
PRACTICALS:
● Basic Unix file system commands such as ls, cd, mkdir, rmdir, cp, rm, mv, more, lpr, man, grep,
sed, etc.
● Shell script.
● Process control system calls - demonstration of fork, exec and wait
Suggested Activities:
● External learning - Introduction to xv6: download, build, boot (in virtual machine if needed).
● Implement a user program in xv6 to print “Hello World!!”.
● Study and use of system calls in xv6: getpid, fork, clone, exit, wait.
● Writing a user program to check and print the state of a process (current/all/specified) in xv6.
Suggested Evaluation Methods:
● Quiz on understanding of Linux and shell programming.
● Implementation evaluation of “Hello World!” user program.
● Quizzes on xv6 system calls.
● Assignments and implementation evaluation.
UNIT II PROCESS SYNCHRONIZATION AND SCHEDULING 9L, 6P
Multicore Programming – Multithreading Models – Thread Libraries – Threading Issues – The Critical-
Section Problem – Peterson’s Solution – Hardware Support for Synchronization – Mutex Locks –
Semaphores – Monitors – Liveness – Basic Concepts of CPU Scheduling– Scheduling Criteria –
Scheduling Algorithms: FCFS, SJF, RR, Priority, Multilevel Queue, Multilevel Feedback Queue – Thread
Scheduling –Real-Time CPU Scheduling.
PRACTICALS:
● Use of ps, ps lx, ps tree, ps –aux , top commands
● Use fork, exec, wait, exit system calls
● Thread management and Thread synchronization.
● Program to simulate preemptive and non-preemptive process scheduling algorithms.
Suggested Activities:
● Add a new system call with parameters in xv6 and invoke it in user program.
● Study of the scheduling algorithm in xv6 and making appropriate changes in the Round Robin
scheduler in xv6 to print the process id and process name during scheduling.
● Assignments on thread and scheduling mechanisms.
Suggested Evaluation Methods:
● Quiz to check the understanding of the scheduling concepts in xv6.CommentHighlight
UNIT III DEADLOCKS AND FILE SYSTEM 9L, 6P
Deadlocks – System model – Deadlock characterization – Methods for handling deadlocks – Deadlock
Prevention –Deadlock Avoidance – Deadlock detection – Recovery from deadlock. File Concept – Access
Methods – Directory Structure – Protection – Memory-Mapped Files – File-System Structure – File-
System Operations – Directory Implementation – Allocation Methods – Free-Space Management –
Recovery – File-System Internals – File-System Mounting – File Sharing – Virtual File Systems – Remote
File Systems.
PRACTICALS:
● Deadlock prevention
● Program to simulate file allocation strategies.
Suggested Activities:
● Create a file in xv6 and perform read and write operations.
Suggested Evaluation Methods:
● Quiz on the understanding of the Deadlocks
UNIT IV MEMORY MANAGEMENT 9L, 6P
Contiguous Memory Allocation – Paging – Structure of the Page Table – Swapping – Demand Paging –
Copy-on-Write – Page Replacement – Allocation of Frames – Thrashing – Memory Compression –
Allocating Kernel Memory.
PRACTICALS:
● Interprocess communication using pipes.
● Interprocess communication using FIFOs.
Suggested Activities:
● Implementation and use of functions malloc() and free() in xv6.
● Implementation of at least one of the page replacement policies
Suggested Evaluation Methods:
● Quizzes on Memory Management
UNIT V STORAGE MANAGEMENT AND CASE STUDIES 9L, 6P
Mass-Storage Structure: Disk Structure - Disk Scheduling Algorithms – NVM Scheduling – Storage
Device Management - Swap Space Management. I/O Systems: I/O Hardware – Application I/O Interface
– Kernel I/O Subsystem – Transforming I/O Requests to Hardware Operations – STREAMS – I/O
Performance – Case study: Linux Vs Windows: Design principles – Process management – Scheduling
– Memory management – File systems and Introduction to Mobile Operating System: Android
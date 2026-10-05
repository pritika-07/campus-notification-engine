# SUBMISSION.md — Campus Notification Engine

## Project

**Campus Notification Engine**

## Original studied

**Novu notification infrastructure**

Original repository: https://github.com/novuhq/novu

## Problem

An exam timetable change may need to reach a very large student population quickly without overwhelming students or sending duplicate notifications. The rebuild focuses on event-triggered workflows, channel preferences, digesting bursts, delivery tracking, and retry behavior.

## Killer tests

### 1. Burst digest
Ten notification events arriving within five minutes for the same user are grouped into one digest notification.

### 2. Channel preference
A user who has muted email receives the notification through in-app only.

### 3. Retry without duplicate
A failed notification send is retried and eventually delivered without creating a duplicate notification.

## Selected improvements

### Gap fix — Atomic workflow writes
Workflow and related control values are written using a transaction/session so a partial write does not leave the workflow in an inconsistent state.

### Differentiator — Academic-calendar-aware digest scheduling
The rebuild introduces an academic-calendar concept so digest windows can adapt to campus periods such as exam weeks. This makes digest scheduling campus-specific rather than a generic fixed schedule.

## Clean-room statement

This project is a clean-room rebuild. The implementation is based on the reverse-engineering observations, requirements, architecture, data model, API specification, and gap analysis documented in this repository. Original source code is not copied into the rebuild.

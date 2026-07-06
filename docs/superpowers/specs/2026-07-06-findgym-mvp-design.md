# Findgym MVP Design

Date: 2026-07-06

## Goal

Build a Taiwan-wide gym discovery app for people who want flexible gym access without being forced into long-term contracts. The product should help users quickly answer:

- What gyms near me can I enter today?
- Which ones are pay-per-use, no-contract, or trial-friendly?
- How do price, equipment, opening hours, reviews, and distance compare?
- Can I trust that the listed information is still current?

## Market Read

The closest direct reference is `找健身 - 免綁約單次收費健身房清單`. It validates the demand for a simple no-contract gym finder, but it appears to be an older list-oriented product with limited comparison depth and a heavy dependency on user reports.

Adjacent products solve different jobs:

- Trainge focuses on courses, trainers, spaces, and transaction workflows.
- PRO360 focuses on service provider matching, including fitness trainers.
- Brand apps such as World Gym focus on their own member ecosystem.
- Google Maps covers discovery and ratings, but does not structure gym pricing, contract terms, or facility details for comparison.

Findgym should not compete as another generic map directory. Its wedge is trustworthy structured data for flexible gym access.

## Target Users

Primary users:

- Travelers, students, business travelers, and temporary residents who need one-off gym access.
- Beginners who want to try gyms before committing.
- Experienced lifters who care about specific facilities such as squat racks, benches, free weights, and 24-hour access.

Secondary users:

- Independent gyms that want visibility without building their own app.
- Users who already have one main gym but need backup locations.

## Product Principles

- Map first, comparison second, booking later.
- Show uncertainty clearly instead of pretending all data is verified.
- Prefer structured fields over free-text descriptions.
- Keep the first release focused on discovery, filtering, comparison, and reporting.
- Exclude or de-emphasize large contract-first gyms when no walk-in, trial, or flexible access is available.

## MVP Scope

The MVP includes:

1. Nearby gym discovery with map and list views.
2. Filters for no-contract access, pay-per-use, currently open, 24-hour access, showers, lockers, free weights, squat racks, and parking.
3. Gym detail pages with address, opening hours, pricing, contract policy, facilities, rating summary, navigation, and contact actions.
4. Side-by-side comparison for up to three gyms.
5. User report flow for missing gyms, wrong prices, wrong hours, closed gyms, wrong map pins, and facility corrections.
6. Freshness indicators such as `last_verified_at`, `verification_source`, and `confidence_level`.

The MVP excludes:

- In-app booking and payment.
- Full social network features.
- Trainer marketplace.
- Workout tracking.
- Membership contract management.
- AI coaching.

## Recommended Approach

Use a mobile-first PWA prototype backed by a simple structured gym dataset. This gives the app a phone-first experience while avoiding native app store overhead during validation. If discovery demand is validated, the same product structure can later be moved into React Native or wrapped for app distribution.

Three approaches were considered:

1. Static directory first.
   - Fastest to launch and easiest to validate.
   - Weak on ongoing data freshness and user contribution.

2. Mobile-first PWA with structured data and report workflow.
   - Best fit for the current goal.
   - Supports discovery, comparison, and iterative data quality improvement.
   - Fast to ship, easy to share, and suitable for App-like validation.
   - Recommended for MVP.

3. Marketplace with booking and payments.
   - Higher revenue potential.
   - Requires gym partnerships, payment operations, refunds, and support.
   - Too heavy before validating discovery demand.

## Core User Flows

### Find Nearby Gym

1. User opens the app.
2. App asks for location permission or accepts manual city/district search.
3. User sees nearby gyms on a map with a synchronized list.
4. User filters by access type, price range, opening status, and facilities.
5. User opens a gym detail page.
6. User taps navigation, phone, website, or save.

### Compare Gyms

1. User selects two or three gyms from list or detail view.
2. App displays a comparison table.
3. Key rows include distance, current status, single-entry price, monthly no-contract price, access restrictions, main equipment, showers, lockers, parking, rating, and data freshness.
4. User can start navigation or save the preferred gym.

### Report Data

1. User taps report on a gym detail page or submits a missing gym.
2. User selects report type.
3. User submits corrected value and optional photo or link.
4. Report enters pending review.
5. Once accepted, the gym record is updated and `last_verified_at` changes.

## Data Model

### Gym

- `id`: Stable internal identifier.
- `name`: Public display name.
- `brand_name`: Chain or brand name when applicable.
- `branch_name`: Branch-specific name.
- `description`: Short editorial summary.
- `status`: `open`, `temporarily_closed`, `closed`, or `unknown`.
- `is_large_contract_first_chain`: Whether the gym is primarily a contract-first chain.
- `is_hidden_by_default`: Whether it should be excluded from default no-contract discovery.
- `created_at`
- `updated_at`

### Location

- `gym_id`
- `address`
- `city`
- `district`
- `latitude`
- `longitude`
- `geocode_source`: `manual`, `google`, `apple`, `osm`, or `user_report`
- `geocode_confidence`: `high`, `medium`, or `low`
- `last_geocoded_at`

### Access Policy

- `gym_id`
- `supports_single_entry`: Boolean.
- `supports_no_contract_monthly`: Boolean.
- `supports_trial`: Boolean.
- `requires_membership_card`: Boolean.
- `requires_reservation`: Boolean.
- `contract_note`: Short explanation.
- `entry_restrictions`: Text for gender, time, visitor, or staff restrictions.

### Pricing

- `gym_id`
- `price_type`: `single_entry`, `hourly`, `daily`, `monthly_no_contract`, `trial`, or `other`.
- `amount_twd`
- `unit`: `per_entry`, `per_hour`, `per_day`, `per_month`, or `custom`.
- `time_limit_minutes`
- `deposit_twd`
- `effective_from`
- `effective_to`
- `source_url`
- `source_note`
- `last_verified_at`

### Facilities

- `gym_id`
- `has_free_weights`
- `has_squat_rack`
- `has_power_rack`
- `has_bench_press`
- `has_deadlift_platform`
- `has_cable_machine`
- `has_cardio`
- `has_group_classes`
- `has_personal_training`
- `has_shower`
- `has_locker`
- `has_parking`
- `is_24_hours`
- `facility_note`

### Opening Hours

- `gym_id`
- `weekday`
- `opens_at`
- `closes_at`
- `is_closed`
- `special_note`
- `last_verified_at`

### Reviews Summary

- `gym_id`
- `external_rating`
- `external_rating_count`
- `external_source`: `google`, `apple`, `manual`, or `none`.
- `internal_rating`
- `internal_rating_count`
- `summary_tags`: Examples: `clean`, `crowded`, `good_for_lifting`, `beginner_friendly`.

### Verification

- `gym_id`
- `field_name`
- `confidence_level`: `verified`, `likely`, `unverified`, or `stale`.
- `verification_source`: `official_site`, `phone_call`, `user_report`, `google_maps`, `social_media`, or `manual_research`.
- `verified_at`
- `verified_by`

### User Report

- `id`
- `gym_id`
- `report_type`: `missing_gym`, `wrong_price`, `wrong_hours`, `wrong_location`, `closed`, `facility_update`, or `other`.
- `submitted_value`
- `evidence_url`
- `photo_url`
- `status`: `pending`, `accepted`, `rejected`, or `needs_more_info`.
- `created_at`
- `reviewed_at`

## Ranking Logic

Default ranking should balance relevance and trust:

1. Nearby distance.
2. Flexible access availability.
3. Currently open status.
4. Pricing completeness.
5. Facility match to active filters.
6. Data freshness.
7. Rating score and review count.

Contract-first chains should be hidden from the default result set unless a branch has confirmed flexible access, free trial, or walk-in entry.

## UX Structure

Main tabs:

- Map
- Compare
- Saved
- Report

Primary map screen:

- Search field for city, district, MRT station, landmark, or gym name.
- Filter bar with access type, open now, price, and facilities.
- Map pins with price or access labels.
- Bottom sheet list sorted by relevance.

Gym detail:

- Name, branch, open status, distance, and confidence indicator.
- Price cards.
- Facility chips.
- Opening hours.
- Rating summary.
- Verification freshness.
- Actions: navigate, call, website, compare, save, report.

## Data Acquisition Strategy

Initial data should be seeded manually for a limited launch region, then expanded.

Phase 1:

- Seed Taipei and New Taipei gyms with known pay-per-use, public sports centers, independent gyms, and no-contract brands.
- Use official websites, public pages, Google Maps links, and manual checks.
- Track every price and opening-hour source.

Phase 2:

- Add Taoyuan, Taichung, Tainan, Kaohsiung.
- Add user report workflow.
- Add admin review workflow.

Phase 3:

- Expand nationwide.
- Add data freshness reminders for stale records.
- Add gym owner claim flow.

## Risks

- Price and opening hours become stale quickly.
- Map pins can be wrong even when addresses are correct.
- Some gyms do not publish contract or single-entry policies clearly.
- User reports can be noisy or malicious.
- Using external ratings and place data may be constrained by provider terms.

Mitigations:

- Show freshness and confidence on every important field.
- Separate official, user-reported, and unverified data.
- Require evidence for high-impact changes.
- Keep an audit trail for accepted reports.
- Avoid storing restricted third-party data unless terms allow it.

## Success Metrics

Early validation metrics:

- Search to detail-open rate.
- Detail to navigation/call/website tap rate.
- Filter usage rate.
- Compare usage rate.
- Report submission rate.
- Percentage of gyms with verified price and hours.
- Percentage of stale records older than 90 days.

## First Implementation Plan

1. Create the app foundation and data schema.
2. Build a seed dataset format for gyms.
3. Build map/list discovery using local seed data.
4. Build gym detail pages.
5. Build filters.
6. Build comparison view.
7. Build report form.
8. Add admin-friendly pending report storage or export.
9. Verify mobile layout and core flows.

The first implementation should prioritize a working local prototype over production infrastructure.

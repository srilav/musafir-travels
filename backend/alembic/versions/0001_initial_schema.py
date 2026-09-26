"""initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2026-09-24 17:36:33.632528
"""
from alembic import op
import sqlalchemy as sa


revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('username', sa.String(length=150), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('username')
    )
    op.create_table('trips',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('destination', sa.String(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('trip_type', sa.Enum('solo', 'couple', 'family', 'group_of_friends', name='trip_type'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('end_date >= start_date', name='ck_trips_date_range'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_trips_user_id'), 'trips', ['user_id'], unique=False)
    op.create_table('days',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('trip_id', sa.Uuid(), nullable=False),
    sa.Column('day_number', sa.Integer(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('trip_id', 'day_number', name='uq_days_trip_day_number')
    )
    op.create_index(op.f('ix_days_trip_id'), 'days', ['trip_id'], unique=False)
    op.create_table('activities',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('day_id', sa.Uuid(), nullable=False),
    sa.Column('text', sa.String(), nullable=False),
    sa.Column('sort_order', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['day_id'], ['days.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_activities_day_id'), 'activities', ['day_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_activities_day_id'), table_name='activities')
    op.drop_table('activities')
    op.drop_index(op.f('ix_days_trip_id'), table_name='days')
    op.drop_table('days')
    op.drop_index(op.f('ix_trips_user_id'), table_name='trips')
    op.drop_table('trips')
    op.drop_table('users')
    sa.Enum(name='trip_type').drop(op.get_bind(), checkfirst=True)

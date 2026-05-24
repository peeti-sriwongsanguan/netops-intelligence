#app/forms.py
from flask_wtf import FlaskForm
from wtforms import (StringField, PasswordField, SubmitField, BooleanField,
                     SelectMultipleField, SelectField)
from wtforms.validators import DataRequired, Length, EqualTo


class LDAPLoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me')
    submit = SubmitField('Log In')


class AdminResetPasswordForm(FlaskForm):
    """Form for an admin to reset a user's password."""
    user = SelectField('Select User to Reset', coerce=int, validators=[DataRequired()])
    submit = SubmitField('Generate New Password')


class ChangePasswordForm(FlaskForm):
    current_password = PasswordField('Current Password', validators=[DataRequired()])
    new_password = PasswordField('New Password',
                                 validators=[DataRequired(), EqualTo('confirm', message='Passwords must match.')])
    confirm = PasswordField('Confirm New Password', validators=[DataRequired()])
    submit = SubmitField('Change Password')


class ForgotPasswordForm(FlaskForm):
    """Form for users to request a password reset link."""
    username = StringField('Enter your VZID (Username)', validators=[DataRequired(), Length(max=64)])
    submit = SubmitField('Send Reset Link')


class ResetPasswordForm(FlaskForm):
    """Form for users to enter their new password."""
    password = PasswordField('New Password',
                             validators=[DataRequired(), EqualTo('confirm', message='Passwords must match.')])
    confirm = PasswordField('Confirm New Password', validators=[DataRequired()])
    submit = SubmitField('Reset Password')


class CreateUserForm(FlaskForm):
    """Form to create a new user."""
    username = StringField('VZID (Username)', validators=[DataRequired(), Length(max=64)])
    groups = SelectMultipleField('Assign to Groups', coerce=int, validators=[DataRequired()])
    submit = SubmitField('Create User')


class CreateGroupForm(FlaskForm):
    """Form to create a new group."""
    name = StringField('Group Name', validators=[DataRequired(), Length(max=64)])
    permissions = SelectMultipleField('Assign Permissions', coerce=int, validators=[DataRequired()])
    submit = SubmitField('Create Group')


class EditUserGroupsForm(FlaskForm):
    """Form to edit a user's group assignments."""
    user = SelectField('Select User', coerce=int, validators=[DataRequired()])
    groups = SelectMultipleField('Assign to Groups', coerce=int, validators=[DataRequired()])
    submit = SubmitField('Update User Assignments')
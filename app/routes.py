# app/routes.py
from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
from wtforms.validators import DataRequired
from app.user import User
from app import db
from flask_mail import Message
from app import mail

main = Blueprint('main', __name__)


# --- Simple Login Form ---
class LDAPLoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me')
    submit = SubmitField('Log In')


# --- 1. Login Page ---
@main.route('/', methods=['GET', 'POST'])
def index():
    if current_user.is_authenticated:
        return redirect(url_for('main.hub'))

    form = LDAPLoginForm()
    if form.validate_on_submit():
        username = form.username.data.lower()
        password = form.password.data

        # Query local SQLite database
        user = User.query.filter_by(username=username).first()

        if user and user.check_password(password):
            login_user(user, remember=form.remember_me.data)
            return redirect(url_for('main.hub'))

        flash('Invalid username or password.', 'danger')

    return render_template('index.html', form=form)


# --- 2. The Hub (App Store) ---
@main.route('/hub')
@login_required
def hub():
    return render_template('protected.html')


# --- 3. Logout ---
@main.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('main.index'))


# --- 4. Send Forgot Password Email ---
@main.route('/forgot-password', methods=['GET', 'POST'])
def forgot_password():
    if current_user.is_authenticated:
        return redirect(url_for('main.hub'))

    from app.forms import ForgotPasswordForm
    form = ForgotPasswordForm()

    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data.lower()).first()

        if user and user.email:
            token = user.get_reset_token()
            # Send the email
            msg = Message('SecAAS Password Reset Request', recipients=[user.email])
            msg.body = f'''To reset your password, visit the following link:
{url_for('main.reset_password', token=token, _external=True)}

If you did not make this request, simply ignore this email and no changes will be made.
'''
            mail.send(msg)
            flash('An email has been sent with instructions to reset your password.', 'info')
        else:
            # Security best practice: Don't reveal if a username exists or not
            flash('If an account with that VZID exists and has an email, a reset link has been sent.', 'info')

        return redirect(url_for('main.index'))

    return render_template('forgot_password.html', form=form)


# --- 5. Actually Reset the Password ---
@main.route('/reset_password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    if current_user.is_authenticated:
        return redirect(url_for('main.hub'))

    user = User.verify_reset_token(token)
    if user is None:
        flash('That is an invalid or expired token', 'danger')
        return redirect(url_for('main.forgot_password'))

    from app.forms import ResetPasswordForm
    form = ResetPasswordForm()

    if form.validate_on_submit():
        user.set_password(form.password.data)
        db.session.commit()
        flash('Your password has been updated! You are now able to log in', 'success')
        return redirect(url_for('main.index'))

    # Reusing the forgot_password template for speed, but passing the Reset form
    return render_template('forgot_password.html', form=form, title='Reset Password')